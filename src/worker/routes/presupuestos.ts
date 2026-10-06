import { and, asc, desc, eq, inArray, max, notExists, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as s from "../../db/schema";
import { enLote, reservarIds, type Db } from "../../db/tipos";
import { claveProducto } from "../../shared/claves";
import { precioLinea, totalLineas, type LineaEntrada } from "../../shared/presupuesto";
import type { AppEnv } from "../env";
import { conflicto, dinero, idDe, noEncontrado, numONull, textoOpcional } from "./comun";

const monto = z.number().nonnegative("No puede ser negativo").max(1_000_000_000).nullable();

const linea = z.object({
  seccion: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .transform((v) => v || null),
  descripcion: z.string().trim().min(1, "Hay una línea sin descripción").max(400, "Descripción muy larga"),
  cantidad: z.number().positive("La cantidad debe ser mayor que 0").max(100_000),
  precioUnitario: monto,
  precioPendiente: z.boolean(),
  productoId: z.number().int().positive().nullable(),
  detalles: z.array(z.string().trim().min(1).max(400)).max(60),
});

const cuerpo = z.object({
  trabajoId: z.number().int().positive().nullish(),
  clienteId: z.number().int().positive().optional(),
  busId: z.number().int().positive().nullish(),
  titulo: textoOpcional(160),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  lugar: textoOpcional(160),
  cerradoEn: monto,
  anticipo: monto,
  notas: textoOpcional(4000),
  notaPie: textoOpcional(600),
  lineas: z.array(linea).max(500, "Máximo 500 líneas"),
});
type Cuerpo = z.infer<typeof cuerpo>;

async function presupuesto(db: Db, id: number) {
  const [p] = await db.select().from(s.presupuestos).where(eq(s.presupuestos.id, id));
  if (!p) throw noEncontrado("Presupuesto");
  return p;
}

async function existe(db: Db, tabla: typeof s.clientes | typeof s.buses | typeof s.trabajos, id: number, que: string) {
  const [f] = await db.select({ id: tabla.id }).from(tabla).where(eq(tabla.id, id));
  if (!f) throw noEncontrado(que);
}

/**
 * Filas de presupuesto_items para las líneas (con ids ya reservados para poder enlazar los detalles).
 * Las líneas escritas a mano se enlazan solas a un producto del catálogo si coinciden con un alias.
 */
async function filasItems(db: Db, presupuestoId: number, lineas: LineaEntrada[]) {
  const sinProducto = lineas.filter((l) => !l.productoId);
  const claves = [...new Set(sinProducto.map((l) => claveProducto(l.descripcion)).filter(Boolean))];
  const pedidos = [...new Set(lineas.map((l) => l.productoId).filter((x): x is number => !!x))];
  const [porAlias, existentes, ids] = await Promise.all([
    claves.length
      ? db.select({ alias: s.productoAlias.alias, id: s.productoAlias.productoId }).from(s.productoAlias).where(inArray(s.productoAlias.alias, claves))
      : [],
    pedidos.length ? db.select({ id: s.productos.id }).from(s.productos).where(inArray(s.productos.id, pedidos)) : [],
    reservarIds(db, "presupuesto_items", lineas.length + lineas.reduce((a, l) => a + l.detalles.length, 0)),
  ]);
  const idPorAlias = new Map(porAlias.map((a) => [a.alias, a.id]));
  const validos = new Set(existentes.map((e) => e.id));

  let k = 0;
  const padres: (typeof s.presupuestoItems.$inferInsert)[] = [];
  const hijos: (typeof s.presupuestoItems.$inferInsert)[] = [];
  lineas.forEach((l, orden) => {
    const id = ids[k++];
    const productoId = l.productoId && validos.has(l.productoId) ? l.productoId : (idPorAlias.get(claveProducto(l.descripcion)) ?? null);
    padres.push({
      id,
      presupuestoId,
      parentId: null,
      orden,
      seccion: l.seccion,
      descripcion: l.descripcion,
      cantidad: String(l.cantidad),
      precioUnitario: dinero(l.precioUnitario) ?? null,
      precio: dinero(precioLinea(l)) ?? null,
      precioPendiente: l.precioPendiente,
      productoId,
    });
    l.detalles.forEach((texto, j) =>
      hijos.push({ id: ids[k++], presupuestoId, parentId: id, orden: j, seccion: l.seccion, descripcion: texto, cantidad: "1", precioPendiente: false }),
    );
  });
  return { padres, hijos };
}

function encabezado(d: Cuerpo) {
  return {
    titulo: d.titulo ?? null,
    fecha: d.fecha,
    lugar: d.lugar ?? null,
    total: dinero(totalLineas(d.lineas)),
    cerradoEn: dinero(d.cerradoEn) ?? null,
    anticipo: dinero(d.anticipo) ?? null,
    notas: d.notas ?? null,
    notaPie: d.notaPie ?? null,
  };
}

export const rutasPresupuestos = new Hono<AppEnv>()
  .get("/", async (c) => {
    const filas = await c.var.db
      .select({
        id: s.presupuestos.id,
        trabajoId: s.presupuestos.trabajoId,
        tipo: s.presupuestos.tipo,
        numero: s.presupuestos.numero,
        titulo: s.presupuestos.titulo,
        fecha: s.presupuestos.fecha,
        estado: s.presupuestos.estado,
        total: s.presupuestos.total,
        cerradoEn: s.presupuestos.cerradoEn,
        origen: s.presupuestos.origen,
        actualizadoEn: s.presupuestos.actualizadoEn,
        estadoTrabajo: s.trabajos.estado,
        clienteId: s.trabajos.clienteId,
        cliente: s.clientes.nombre,
        busId: s.trabajos.busId,
        bus: s.buses.nombre,
        placa: s.buses.placa,
      })
      .from(s.presupuestos)
      .innerJoin(s.trabajos, eq(s.trabajos.id, s.presupuestos.trabajoId))
      .innerJoin(s.clientes, eq(s.clientes.id, s.trabajos.clienteId))
      .leftJoin(s.buses, eq(s.buses.id, s.trabajos.busId))
      .orderBy(sql`${s.presupuestos.fecha} desc nulls last`, desc(s.presupuestos.id));
    return c.json(filas.map((f) => ({ ...f, total: Number(f.total ?? 0), cerradoEn: numONull(f.cerradoEn) })));
  })

  .get("/:id", async (c) => {
    const id = idDe(c);
    const p = await presupuesto(c.var.db, id);
    const [items, trabajo, hermanos] = await Promise.all([
      c.var.db
        .select()
        .from(s.presupuestoItems)
        .where(eq(s.presupuestoItems.presupuestoId, id))
        .orderBy(asc(s.presupuestoItems.orden), asc(s.presupuestoItems.id)),
      c.var.db
        .select({
          id: s.trabajos.id,
          estado: s.trabajos.estado,
          clienteId: s.trabajos.clienteId,
          cliente: s.clientes.nombre,
          busId: s.trabajos.busId,
          bus: s.buses.nombre,
          placa: s.buses.placa,
        })
        .from(s.trabajos)
        .innerJoin(s.clientes, eq(s.clientes.id, s.trabajos.clienteId))
        .leftJoin(s.buses, eq(s.buses.id, s.trabajos.busId))
        .where(eq(s.trabajos.id, p.trabajoId)),
      c.var.db
        .select({
          id: s.presupuestos.id,
          tipo: s.presupuestos.tipo,
          numero: s.presupuestos.numero,
          fecha: s.presupuestos.fecha,
          estado: s.presupuestos.estado,
          total: s.presupuestos.total,
          cerradoEn: s.presupuestos.cerradoEn,
          anticipo: s.presupuestos.anticipo,
        })
        .from(s.presupuestos)
        .where(eq(s.presupuestos.trabajoId, p.trabajoId))
        .orderBy(asc(s.presupuestos.numero), asc(s.presupuestos.fecha), asc(s.presupuestos.id)),
    ]);
    return c.json({
      ...p,
      total: Number(p.total ?? 0),
      cerradoEn: numONull(p.cerradoEn),
      anticipo: numONull(p.anticipo),
      items: items.map((i) => ({
        id: i.id,
        parentId: i.parentId,
        orden: i.orden,
        seccion: i.seccion,
        descripcion: i.descripcion,
        cantidad: Number(i.cantidad),
        precioUnitario: numONull(i.precioUnitario),
        precio: numONull(i.precio),
        precioPendiente: i.precioPendiente,
        productoId: i.productoId,
      })),
      trabajo: trabajo[0],
      hermanos: hermanos.map((h) => ({ ...h, total: Number(h.total ?? 0), cerradoEn: numONull(h.cerradoEn), anticipo: numONull(h.anticipo) })),
    });
  })

  /** Nuevo presupuesto: de un trabajo nuevo (clienteId) o EXTRA de un trabajo existente (trabajoId). */
  .post("/", async (c) => {
    const d = cuerpo.parse(await c.req.json());
    const db = c.var.db;
    let trabajoId = d.trabajoId ?? null;
    let numero = 0;
    const consultas: PromiseLike<unknown>[] = [];

    if (trabajoId) {
      await existe(db, s.trabajos, trabajoId, "Trabajo");
      const [{ m }] = await db.select({ m: max(s.presupuestos.numero) }).from(s.presupuestos).where(eq(s.presupuestos.trabajoId, trabajoId));
      numero = (m ?? 0) + 1;
    } else {
      if (!d.clienteId) throw new HTTPException(400, { message: "Escoge el cliente" });
      await existe(db, s.clientes, d.clienteId, "Cliente");
      if (d.busId) await existe(db, s.buses, d.busId, "Bus");
      [trabajoId] = await reservarIds(db, "trabajos", 1);
      consultas.push(
        db.insert(s.trabajos).values({ id: trabajoId, clienteId: d.clienteId, busId: d.busId ?? null, estado: "cotizado", fechaInicio: d.fecha, origen: "app" }),
      );
    }

    const [presupuestoId] = await reservarIds(db, "presupuestos", 1);
    const { padres, hijos } = await filasItems(db, presupuestoId, d.lineas);
    consultas.push(
      db.insert(s.presupuestos).values({
        id: presupuestoId,
        trabajoId,
        tipo: numero ? "extra" : "original",
        numero,
        estado: "borrador",
        origen: "app",
        creadoPor: c.var.usuario.id,
        ...encabezado(d),
      }),
    );
    if (padres.length) consultas.push(db.insert(s.presupuestoItems).values(padres));
    if (hijos.length) consultas.push(db.insert(s.presupuestoItems).values(hijos));
    await enLote(db, consultas);
    return c.json({ id: presupuestoId, trabajoId }, 201);
  })

  /** Guarda todo el presupuesto (encabezado + líneas). Las líneas se reemplazan completas. */
  .put("/:id", async (c) => {
    const id = idDe(c);
    const d = cuerpo.parse(await c.req.json());
    const db = c.var.db;
    const p = await presupuesto(db, id);
    if (d.clienteId) await existe(db, s.clientes, d.clienteId, "Cliente");
    if (d.busId) await existe(db, s.buses, d.busId, "Bus");
    const { padres, hijos } = await filasItems(db, id, d.lineas);

    const cambiosTrabajo = {
      ...(d.clienteId ? { clienteId: d.clienteId } : {}),
      ...(d.busId !== undefined ? { busId: d.busId ?? null } : {}),
      ...(p.tipo === "original" ? { fechaInicio: d.fecha } : {}),
    };
    await enLote(db, [
      db.delete(s.presupuestoItems).where(eq(s.presupuestoItems.presupuestoId, id)),
      ...(padres.length ? [db.insert(s.presupuestoItems).values(padres)] : []),
      ...(hijos.length ? [db.insert(s.presupuestoItems).values(hijos)] : []),
      db.update(s.presupuestos).set(encabezado(d)).where(eq(s.presupuestos.id, id)),
      ...(Object.keys(cambiosTrabajo).length ? [db.update(s.trabajos).set(cambiosTrabajo).where(eq(s.trabajos.id, p.trabajoId))] : []),
    ]);
    return c.json({ ok: true });
  })

  .patch("/:id/estado", async (c) => {
    const id = idDe(c);
    const { estado } = z.object({ estado: z.enum(["borrador", "listo"]) }).parse(await c.req.json());
    await presupuesto(c.var.db, id);
    await c.var.db.update(s.presupuestos).set({ estado }).where(eq(s.presupuestos.id, id));
    return c.json({ ok: true });
  })

  /** Solo borradores. Si era el único presupuesto del trabajo, el trabajo también se borra. */
  .delete("/:id", async (c) => {
    const id = idDe(c);
    const db = c.var.db;
    const p = await presupuesto(db, id);
    if (p.estado !== "borrador") throw conflicto("Solo se pueden borrar borradores. Pásalo a borrador primero.");
    await enLote(db, [
      db.delete(s.presupuestos).where(eq(s.presupuestos.id, id)),
      db
        .delete(s.trabajos)
        .where(
          and(
            eq(s.trabajos.id, p.trabajoId),
            notExists(db.select({ x: sql`1` }).from(s.presupuestos).where(eq(s.presupuestos.trabajoId, p.trabajoId))),
          ),
        ),
    ]);
    return c.json({ ok: true });
  });
