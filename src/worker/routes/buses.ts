import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as s from "../../db/schema";
import { enLote, type Db } from "../../db/tipos";
import { normalizarPlaca } from "../../shared/claves";
import type { AppEnv } from "../env";
import { conflicto, cuerpoUnir, idDe, noEncontrado, soloDefinidos, textoOpcional, trabajosDonde } from "./comun";

const campos = {
  clienteId: z.number().int().positive().nullable().optional(),
  placa: textoOpcional(20).transform((v) => (v ? normalizarPlaca(v) : v)),
  nombre: textoOpcional(80),
  descripcion: textoOpcional(200),
  notas: textoOpcional(1000),
};
const nuevo = z.object(campos).refine((b) => b.placa || b.nombre, "Pon al menos la placa o un nombre para reconocer el bus");
const cambio = z.object(campos);

async function bus(db: Db, id: number) {
  const [b] = await db.select().from(s.buses).where(eq(s.buses.id, id));
  if (!b) throw noEncontrado("Bus");
  return b;
}

async function revisarPlaca(db: Db, placa: string | null | undefined, excepto?: number) {
  if (!placa) return;
  const [otro] = await db
    .select({ id: s.buses.id, nombre: s.buses.nombre })
    .from(s.buses)
    .where(and(eq(s.buses.placa, placa), excepto ? ne(s.buses.id, excepto) : undefined))
    .limit(1);
  if (otro) throw conflicto(`La placa ${placa} ya es de otro bus${otro.nombre ? ` (${otro.nombre})` : ""}`);
}

async function revisarCliente(db: Db, clienteId: number | null | undefined) {
  if (!clienteId) return;
  const [c] = await db.select({ id: s.clientes.id }).from(s.clientes).where(eq(s.clientes.id, clienteId));
  if (!c) throw noEncontrado("Cliente");
}

export const rutasBuses = new Hono<AppEnv>()
  .get("/", async (c) => {
    const filas = await c.var.db
      .select({
        id: s.buses.id,
        nombre: s.buses.nombre,
        placa: s.buses.placa,
        descripcion: s.buses.descripcion,
        notas: s.buses.notas,
        clienteId: s.buses.clienteId,
        cliente: s.clientes.nombre,
        trabajos: sql<number>`(select count(*) from trabajos where trabajos.bus_id = buses.id)`.mapWith(Number),
        ultima: sql<string | null>`(select to_char(max(presupuestos.fecha), 'YYYY-MM-DD') from presupuestos join trabajos on trabajos.id = presupuestos.trabajo_id where trabajos.bus_id = buses.id)`,
      })
      .from(s.buses)
      .leftJoin(s.clientes, eq(s.clientes.id, s.buses.clienteId))
      .orderBy(asc(s.clientes.nombre), asc(s.buses.nombre));
    return c.json(filas);
  })

  .get("/:id", async (c) => {
    const id = idDe(c);
    const datos = await bus(c.var.db, id);
    const [cliente, trabajos] = await Promise.all([
      datos.clienteId
        ? c.var.db.select({ id: s.clientes.id, nombre: s.clientes.nombre }).from(s.clientes).where(eq(s.clientes.id, datos.clienteId))
        : [],
      trabajosDonde(c.var.db, eq(s.trabajos.busId, id)),
    ]);
    return c.json({ ...datos, cliente: cliente[0]?.nombre ?? null, trabajos });
  })

  .post("/", async (c) => {
    const datos = nuevo.parse(await c.req.json());
    await Promise.all([revisarPlaca(c.var.db, datos.placa), revisarCliente(c.var.db, datos.clienteId)]);
    const [creado] = await c.var.db
      .insert(s.buses)
      .values({
        clienteId: datos.clienteId ?? null,
        placa: datos.placa ?? null,
        nombre: datos.nombre ?? null,
        descripcion: datos.descripcion ?? null,
        notas: datos.notas ?? null,
      })
      .returning({ id: s.buses.id });
    return c.json(creado, 201);
  })

  .patch("/:id", async (c) => {
    const id = idDe(c);
    const datos = soloDefinidos(cambio.parse(await c.req.json()));
    const actual = await bus(c.var.db, id);
    const placa = datos.placa !== undefined ? datos.placa : actual.placa;
    const nombre = datos.nombre !== undefined ? datos.nombre : actual.nombre;
    if (!placa && !nombre) throw new HTTPException(400, { message: "El bus necesita placa o nombre" });
    await Promise.all([revisarPlaca(c.var.db, datos.placa, id), revisarCliente(c.var.db, datos.clienteId)]);
    if (Object.keys(datos).length) await c.var.db.update(s.buses).set(datos).where(eq(s.buses.id, id));
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const id = idDe(c);
    await bus(c.var.db, id);
    const [{ n }] = await c.var.db.select({ n: count() }).from(s.trabajos).where(eq(s.trabajos.busId, id));
    if (n > 0) throw conflicto(`Tiene ${n} ${n === 1 ? "trabajo" : "trabajos"}. Si está repetido, únelo con el otro bus en vez de borrarlo.`);
    await c.var.db.delete(s.buses).where(eq(s.buses.id, id));
    return c.json({ ok: true });
  })

  /** Une `otroId` dentro de este bus: le pasa los trabajos y lo que le falte (placa, nombre…). */
  .post("/:id/unir", async (c) => {
    const id = idDe(c);
    const { otroId } = cuerpoUnir.parse(await c.req.json());
    if (otroId === id) throw new HTTPException(400, { message: "Es el mismo bus" });
    const [queda, otro] = await Promise.all([bus(c.var.db, id), bus(c.var.db, otroId)]);
    const db = c.var.db;
    await enLote(db, [
      db.update(s.trabajos).set({ busId: id }).where(eq(s.trabajos.busId, otroId)),
      // Se borra antes de copiar la placa: es única.
      db.delete(s.buses).where(eq(s.buses.id, otroId)),
      db
        .update(s.buses)
        .set({
          placa: queda.placa ?? otro.placa,
          nombre: queda.nombre ?? otro.nombre,
          descripcion: queda.descripcion ?? otro.descripcion,
          clienteId: queda.clienteId ?? otro.clienteId,
          notas: [queda.notas, otro.notas].filter(Boolean).join("\n") || null,
        })
        .where(eq(s.buses.id, id)),
    ]);
    return c.json({ ok: true });
  });
