import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as s from "../../db/schema";
import { enLote, type Db } from "../../db/tipos";
import { claveCliente } from "../../shared/claves";
import type { AppEnv } from "../env";
import { agrupar, conflicto, cuerpoUnir, idDe, limpiarDescartes, noEncontrado, rutasDescartes, soloDefinidos, textoOpcional, trabajosDonde } from "./comun";

const nombre = z.string().trim().min(2, "El nombre es muy corto").max(120, "Máximo 120 caracteres");
const nuevo = z.object({ nombre, telefono: textoOpcional(40), notas: textoOpcional(1000) });
const cambio = z.object({ nombre: nombre.optional(), telefono: textoOpcional(40), notas: textoOpcional(1000) });

/** Si otro cliente ya usa ese nombre (o uno que se escribe igual), lo devuelve. */
async function clienteConMismoNombre(db: Db, nombreNuevo: string, excepto?: number) {
  const [fila] = await db
    .select({ id: s.clientes.id, nombre: s.clientes.nombre })
    .from(s.clienteAlias)
    .innerJoin(s.clientes, eq(s.clientes.id, s.clienteAlias.clienteId))
    .where(and(eq(s.clienteAlias.alias, claveCliente(nombreNuevo)), excepto ? ne(s.clientes.id, excepto) : undefined))
    .limit(1);
  return fila ?? null;
}

async function cliente(db: Db, id: number) {
  const [c] = await db.select().from(s.clientes).where(eq(s.clientes.id, id));
  if (!c) throw noEncontrado("Cliente");
  return c;
}

export const rutasClientes = new Hono<AppEnv>()
  .route("/duplicados/descartados", rutasDescartes("clientes"))

  .get("/", async (c) => {
    const [filas, alias] = await Promise.all([
      c.var.db
        .select({
          id: s.clientes.id,
          nombre: s.clientes.nombre,
          telefono: s.clientes.telefono,
          notas: s.clientes.notas,
          buses: sql<number>`(select count(*) from buses where buses.cliente_id = clientes.id)`.mapWith(Number),
          trabajos: sql<number>`(select count(*) from trabajos where trabajos.cliente_id = clientes.id)`.mapWith(Number),
          ultima: sql<string | null>`(select to_char(max(presupuestos.fecha), 'YYYY-MM-DD') from presupuestos join trabajos on trabajos.id = presupuestos.trabajo_id where trabajos.cliente_id = clientes.id)`,
        })
        .from(s.clientes)
        .orderBy(asc(s.clientes.nombre)),
      c.var.db.select({ clienteId: s.clienteAlias.clienteId, alias: s.clienteAlias.alias }).from(s.clienteAlias),
    ]);
    const porCliente = agrupar(alias, (a) => a.clienteId);
    return c.json(filas.map((f) => ({ ...f, alias: (porCliente.get(f.id) ?? []).map((a) => a.alias) })));
  })

  .get("/:id", async (c) => {
    const id = idDe(c);
    const [datos, alias, buses, trabajos] = await Promise.all([
      cliente(c.var.db, id),
      c.var.db.select({ alias: s.clienteAlias.alias }).from(s.clienteAlias).where(eq(s.clienteAlias.clienteId, id)),
      c.var.db
        .select({
          id: s.buses.id,
          nombre: s.buses.nombre,
          placa: s.buses.placa,
          descripcion: s.buses.descripcion,
          trabajos: sql<number>`(select count(*) from trabajos where trabajos.bus_id = buses.id)`.mapWith(Number),
        })
        .from(s.buses)
        .where(eq(s.buses.clienteId, id))
        .orderBy(asc(s.buses.nombre)),
      trabajosDonde(c.var.db, eq(s.trabajos.clienteId, id)),
    ]);
    return c.json({ ...datos, alias: alias.map((a) => a.alias), buses, trabajos });
  })

  .post("/", async (c) => {
    const datos = nuevo.parse(await c.req.json());
    const repetido = await clienteConMismoNombre(c.var.db, datos.nombre);
    if (repetido) throw conflicto(`Ya existe el cliente “${repetido.nombre}”`);
    const [creado] = await c.var.db
      .insert(s.clientes)
      .values({ nombre: datos.nombre, telefono: datos.telefono ?? null, notas: datos.notas ?? null })
      .returning({ id: s.clientes.id });
    await c.var.db.insert(s.clienteAlias).values({ clienteId: creado.id, alias: claveCliente(datos.nombre) }).onConflictDoNothing();
    return c.json(creado, 201);
  })

  .patch("/:id", async (c) => {
    const id = idDe(c);
    const datos = soloDefinidos(cambio.parse(await c.req.json()));
    await cliente(c.var.db, id);
    if (!Object.keys(datos).length) return c.json({ ok: true });
    if (datos.nombre) {
      const repetido = await clienteConMismoNombre(c.var.db, datos.nombre, id);
      if (repetido) throw conflicto(`Ya existe el cliente “${repetido.nombre}”. Si es el mismo, únelos.`);
    }
    await enLote(c.var.db, [
      c.var.db.update(s.clientes).set(datos).where(eq(s.clientes.id, id)),
      ...(datos.nombre
        ? [c.var.db.insert(s.clienteAlias).values({ clienteId: id, alias: claveCliente(datos.nombre) }).onConflictDoNothing()]
        : []),
    ]);
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const id = idDe(c);
    await cliente(c.var.db, id);
    const [{ n }] = await c.var.db.select({ n: count() }).from(s.trabajos).where(eq(s.trabajos.clienteId, id));
    if (n > 0)
      throw conflicto(`Tiene ${n} ${n === 1 ? "trabajo" : "trabajos"}. Si está repetido, únelo con el otro cliente en vez de borrarlo.`);
    // Sus buses quedan sin cliente (la llave foránea los pone en null).
    await enLote(c.var.db, [limpiarDescartes(c.var.db, "clientes", id), c.var.db.delete(s.clientes).where(eq(s.clientes.id, id))]);
    return c.json({ ok: true });
  })

  /** Une `otroId` dentro de este cliente: le pasa trabajos, buses y alias, y borra el otro. */
  .post("/:id/unir", async (c) => {
    const id = idDe(c);
    const { otroId } = cuerpoUnir.parse(await c.req.json());
    if (otroId === id) throw new HTTPException(400, { message: "Es el mismo cliente" });
    const [queda, otro] = await Promise.all([cliente(c.var.db, id), cliente(c.var.db, otroId)]);
    const db = c.var.db;
    await enLote(db, [
      db.update(s.buses).set({ clienteId: id }).where(eq(s.buses.clienteId, otroId)),
      db.update(s.trabajos).set({ clienteId: id }).where(eq(s.trabajos.clienteId, otroId)),
      db.update(s.clienteAlias).set({ clienteId: id }).where(eq(s.clienteAlias.clienteId, otroId)),
      db.insert(s.clienteAlias).values({ clienteId: id, alias: claveCliente(otro.nombre) }).onConflictDoNothing(),
      db
        .update(s.clientes)
        .set({
          telefono: queda.telefono ?? otro.telefono,
          notas: [queda.notas, otro.notas].filter(Boolean).join("\n") || null,
        })
        .where(eq(s.clientes.id, id)),
      limpiarDescartes(db, "clientes", otroId),
      db.delete(s.clientes).where(eq(s.clientes.id, otroId)),
    ]);
    return c.json({ ok: true });
  });
