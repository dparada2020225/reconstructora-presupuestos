import { and, asc, count, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as s from "../../db/schema";
import { enLote, type Db } from "../../db/tipos";
import { claveProducto } from "../../shared/claves";
import type { AppEnv } from "../env";
import {
  agrupar,
  conflicto,
  cuerpoUnir,
  dinero,
  idDe,
  limpiarDescartes,
  noEncontrado,
  numONull,
  rutasDescartes,
  soloDefinidos,
  textoOpcional,
} from "./comun";

const nombre = z.string().trim().min(2, "El nombre es muy corto").max(160, "Máximo 160 caracteres");
const campos = {
  categoria: textoOpcional(40).transform((v) => (v ? v.toUpperCase() : v)),
  precioReferencia: z.number().nonnegative("El precio no puede ser negativo").max(10_000_000).nullable().optional(),
  unidad: textoOpcional(30),
  notas: textoOpcional(1000),
};
const nuevo = z.object({ nombre, ...campos });
const cambio = z.object({ nombre: nombre.optional(), activo: z.boolean().optional(), ...campos });

/** Precio por unidad de una línea: el escrito, o el total entre la cantidad. */
const unitario = sql<string | null>`coalesce(${s.presupuestoItems.precioUnitario}, ${s.presupuestoItems.precio} / nullif(${s.presupuestoItems.cantidad}, 0))`;

async function producto(db: Db, id: number) {
  const [p] = await db.select().from(s.productos).where(eq(s.productos.id, id));
  if (!p) throw noEncontrado("Producto");
  return p;
}

/** Otro producto con el mismo nombre o uno que se escribe igual. */
async function productoConMismoNombre(db: Db, nombreNuevo: string, excepto?: number) {
  const [fila] = await db
    .selectDistinct({ id: s.productos.id, nombre: s.productos.nombre })
    .from(s.productos)
    .leftJoin(s.productoAlias, eq(s.productoAlias.productoId, s.productos.id))
    .where(
      and(
        or(sql`lower(${s.productos.nombre}) = lower(${nombreNuevo})`, eq(s.productoAlias.alias, claveProducto(nombreNuevo))),
        excepto ? ne(s.productos.id, excepto) : undefined,
      ),
    )
    .limit(1);
  return fila ?? null;
}

const aNumero = <T extends { precioReferencia: string | null }>(p: T) => ({ ...p, precioReferencia: numONull(p.precioReferencia) });

export const rutasProductos = new Hono<AppEnv>()
  .route("/duplicados/descartados", rutasDescartes("productos"))

  .get("/", async (c) => {
    const [filas, alias] = await Promise.all([
      c.var.db
        .select({
          id: s.productos.id,
          nombre: s.productos.nombre,
          categoria: s.productos.categoria,
          precioReferencia: s.productos.precioReferencia,
          unidad: s.productos.unidad,
          activo: s.productos.activo,
          veces: sql<number>`(select count(*) from presupuesto_items i where i.producto_id = productos.id and i.parent_id is null)`.mapWith(Number),
          ultimaFecha: sql<string | null>`(select to_char(max(p.fecha), 'YYYY-MM-DD') from presupuesto_items i join presupuestos p on p.id = i.presupuesto_id where i.producto_id = productos.id)`,
          ultimoPrecio: sql<string | null>`(select coalesce(i.precio_unitario, i.precio / nullif(i.cantidad, 0)) from presupuesto_items i join presupuestos p on p.id = i.presupuesto_id where i.producto_id = productos.id and i.precio is not null order by p.fecha desc nulls last, i.id desc limit 1)`,
        })
        .from(s.productos)
        .orderBy(asc(s.productos.nombre)),
      c.var.db.select({ productoId: s.productoAlias.productoId, alias: s.productoAlias.alias }).from(s.productoAlias),
    ]);
    const porProducto = agrupar(alias, (a) => a.productoId);
    return c.json(
      filas.map((f) => ({
        ...aNumero(f),
        ultimoPrecio: numONull(f.ultimoPrecio),
        alias: (porProducto.get(f.id) ?? []).map((a) => a.alias),
      })),
    );
  })

  .get("/:id", async (c) => {
    const id = idDe(c);
    const deEste = and(eq(s.presupuestoItems.productoId, id), isNull(s.presupuestoItems.parentId));
    const [datos, alias, usos, porAnio, total] = await Promise.all([
      producto(c.var.db, id),
      c.var.db.select({ alias: s.productoAlias.alias }).from(s.productoAlias).where(eq(s.productoAlias.productoId, id)),
      c.var.db
        .select({
          id: s.presupuestoItems.id,
          presupuestoId: s.presupuestos.id,
          trabajoId: s.presupuestos.trabajoId,
          tipo: s.presupuestos.tipo,
          fecha: s.presupuestos.fecha,
          clienteId: s.clientes.id,
          cliente: s.clientes.nombre,
          descripcion: s.presupuestoItems.descripcion,
          cantidad: s.presupuestoItems.cantidad,
          unitario,
          precio: s.presupuestoItems.precio,
        })
        .from(s.presupuestoItems)
        .innerJoin(s.presupuestos, eq(s.presupuestos.id, s.presupuestoItems.presupuestoId))
        .innerJoin(s.trabajos, eq(s.trabajos.id, s.presupuestos.trabajoId))
        .innerJoin(s.clientes, eq(s.clientes.id, s.trabajos.clienteId))
        .where(deEste)
        .orderBy(sql`${s.presupuestos.fecha} desc nulls last`, desc(s.presupuestoItems.id))
        .limit(200),
      c.var.db
        .select({
          anio: sql<string>`to_char(${s.presupuestos.fecha}, 'YYYY')`,
          mediana: sql<string>`percentile_cont(0.5) within group (order by ${unitario})`,
          n: count(),
        })
        .from(s.presupuestoItems)
        .innerJoin(s.presupuestos, eq(s.presupuestos.id, s.presupuestoItems.presupuestoId))
        .where(and(deEste, isNotNull(s.presupuestoItems.precio), isNotNull(s.presupuestos.fecha)))
        .groupBy(sql`to_char(${s.presupuestos.fecha}, 'YYYY')`)
        .orderBy(sql`to_char(${s.presupuestos.fecha}, 'YYYY')`),
      c.var.db.select({ n: count() }).from(s.presupuestoItems).where(deEste),
    ]);
    return c.json({
      ...aNumero(datos),
      alias: alias.map((a) => a.alias),
      veces: total[0]?.n ?? 0,
      usos: usos.map((u) => ({ ...u, cantidad: Number(u.cantidad), unitario: numONull(u.unitario), precio: numONull(u.precio) })),
      porAnio: porAnio.map((a) => ({ anio: a.anio, mediana: Number(a.mediana), n: Number(a.n) })),
    });
  })

  .post("/", async (c) => {
    const datos = nuevo.parse(await c.req.json());
    const repetido = await productoConMismoNombre(c.var.db, datos.nombre);
    if (repetido) throw conflicto(`Ya existe “${repetido.nombre}”`);
    const [creado] = await c.var.db
      .insert(s.productos)
      .values({
        nombre: datos.nombre,
        categoria: datos.categoria ?? null,
        precioReferencia: dinero(datos.precioReferencia) ?? null,
        unidad: datos.unidad ?? null,
        notas: datos.notas ?? null,
      })
      .returning({ id: s.productos.id });
    await c.var.db.insert(s.productoAlias).values({ productoId: creado.id, alias: claveProducto(datos.nombre) }).onConflictDoNothing();
    return c.json(creado, 201);
  })

  .patch("/:id", async (c) => {
    const id = idDe(c);
    const { precioReferencia, ...resto } = cambio.parse(await c.req.json());
    const datos = soloDefinidos({ ...resto, precioReferencia: dinero(precioReferencia) });
    await producto(c.var.db, id);
    if (!Object.keys(datos).length) return c.json({ ok: true });
    if (datos.nombre) {
      const repetido = await productoConMismoNombre(c.var.db, datos.nombre, id);
      if (repetido) throw conflicto(`Ya existe “${repetido.nombre}”. Si es lo mismo, únelos.`);
    }
    await enLote(c.var.db, [
      c.var.db.update(s.productos).set(datos).where(eq(s.productos.id, id)),
      ...(datos.nombre
        ? [c.var.db.insert(s.productoAlias).values({ productoId: id, alias: claveProducto(datos.nombre) }).onConflictDoNothing()]
        : []),
    ]);
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const id = idDe(c);
    await producto(c.var.db, id);
    const [{ n }] = await c.var.db.select({ n: count() }).from(s.presupuestoItems).where(eq(s.presupuestoItems.productoId, id));
    if (n > 0)
      throw conflicto(
        `Aparece en ${n} ${n === 1 ? "línea" : "líneas"} de presupuestos. Desactívalo para que no salga al cotizar, o únelo con otro.`,
      );
    await enLote(c.var.db, [limpiarDescartes(c.var.db, "productos", id), c.var.db.delete(s.productos).where(eq(s.productos.id, id))]);
    return c.json({ ok: true });
  })

  /** Une `otroId` dentro de este producto: le pasa sus líneas de presupuestos y alias, y lo borra. */
  .post("/:id/unir", async (c) => {
    const id = idDe(c);
    const { otroId } = cuerpoUnir.parse(await c.req.json());
    if (otroId === id) throw new HTTPException(400, { message: "Es el mismo producto" });
    const [queda, otro] = await Promise.all([producto(c.var.db, id), producto(c.var.db, otroId)]);
    const db = c.var.db;
    await enLote(db, [
      db.update(s.presupuestoItems).set({ productoId: id }).where(eq(s.presupuestoItems.productoId, otroId)),
      db.update(s.productoAlias).set({ productoId: id }).where(eq(s.productoAlias.productoId, otroId)),
      db.insert(s.productoAlias).values({ productoId: id, alias: claveProducto(otro.nombre) }).onConflictDoNothing(),
      limpiarDescartes(db, "productos", otroId),
      db.delete(s.productos).where(eq(s.productos.id, otroId)),
      db
        .update(s.productos)
        .set({
          categoria: queda.categoria ?? otro.categoria,
          precioReferencia: queda.precioReferencia ?? otro.precioReferencia,
          unidad: queda.unidad ?? otro.unidad,
          notas: [queda.notas, otro.notas].filter(Boolean).join("\n") || null,
          activo: queda.activo || otro.activo,
        })
        .where(eq(s.productos.id, id)),
    ]);
    return c.json({ ok: true });
  });
