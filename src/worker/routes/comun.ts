import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as s from "../../db/schema";
import type { Db } from "../../db/tipos";
import { montoTrabajo } from "../../shared/estadisticas";
import type { AppEnv } from "../env";

export function idDe(c: Context<AppEnv>, nombre = "id"): number {
  const n = Number(c.req.param(nombre));
  if (!Number.isInteger(n) || n <= 0) throw new HTTPException(400, { message: "id inválido" });
  return n;
}

export const noEncontrado = (que: string) => new HTTPException(404, { message: `${que} no encontrado` });
export const conflicto = (mensaje: string) => new HTTPException(409, { message: mensaje });

/** Agrupa en un Map por llave (Map.groupBy todavía no está en la lib de TS que usamos). */
export function agrupar<T, K>(xs: T[], llave: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = llave(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Quita las llaves undefined (Drizzle no acepta un update vacío). */
export function soloDefinidos<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const dinero = (n: number | null | undefined) => (n === null || n === undefined ? n : n.toFixed(2));
export const numONull = (x: unknown) => (x === null || x === undefined ? null : Number(x));

/**
 * Texto opcional de un formulario: undefined = no cambiar; "" o null = borrar.
 */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

export const cuerpoUnir = z.object({ otroId: z.number().int().positive() });

/* ───────────── Trabajos de un cliente o de un bus (para las páginas de detalle) ───────────── */

export async function trabajosDonde(db: Db, donde: SQL | undefined) {
  const trabajos = await db
    .select({
      id: s.trabajos.id,
      titulo: s.trabajos.titulo,
      estado: s.trabajos.estado,
      fechaInicio: s.trabajos.fechaInicio,
      clienteId: s.trabajos.clienteId,
      cliente: s.clientes.nombre,
      busId: s.trabajos.busId,
      bus: s.buses.nombre,
      placa: s.buses.placa,
    })
    .from(s.trabajos)
    .innerJoin(s.clientes, eq(s.clientes.id, s.trabajos.clienteId))
    .leftJoin(s.buses, eq(s.buses.id, s.trabajos.busId))
    .where(donde);
  if (!trabajos.length) return [];
  const presupuestos = await db
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
    })
    .from(s.presupuestos)
    .where(inArray(s.presupuestos.trabajoId, trabajos.map((t) => t.id)))
    .orderBy(asc(s.presupuestos.numero), asc(s.presupuestos.fecha), asc(s.presupuestos.id));

  return trabajos
    .map((t) => {
      const ps = presupuestos
        .filter((p) => p.trabajoId === t.id)
        .map((p) => ({ ...p, total: Number(p.total ?? 0), cerradoEn: numONull(p.cerradoEn) }));
      const m = montoTrabajo(ps);
      return {
        ...t,
        fecha: ps[0]?.fecha ?? t.fechaInicio,
        presupuestos: ps.map(({ trabajoId: _, ...p }) => p),
        cotizado: m.cotizado,
        monto: m.final,
      };
    })
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

/* ───────────── Pares marcados como "no son el mismo" ───────────── */

export function rutasDescartes(tipo: "clientes" | "productos") {
  const par = z.object({ aId: z.number().int().positive(), bId: z.number().int().positive() });
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const filas = await c.var.db
        .select({ aId: s.duplicadosDescartados.aId, bId: s.duplicadosDescartados.bId })
        .from(s.duplicadosDescartados)
        .where(eq(s.duplicadosDescartados.tipo, tipo));
      return c.json(filas);
    })
    .post("/", async (c) => {
      const { aId, bId } = par.parse(await c.req.json());
      if (aId === bId) throw new HTTPException(400, { message: "Es el mismo registro" });
      await c.var.db
        .insert(s.duplicadosDescartados)
        .values({ tipo, aId: Math.min(aId, bId), bId: Math.max(aId, bId) })
        .onConflictDoNothing();
      return c.json({ ok: true });
    });
}

/** Borra los descartes en los que aparece un registro que se va a borrar o unir. */
export const limpiarDescartes = (db: Db, tipo: "clientes" | "productos", id: number) =>
  db
    .delete(s.duplicadosDescartados)
    .where(
      and(
        eq(s.duplicadosDescartados.tipo, tipo),
        or(eq(s.duplicadosDescartados.aId, id), eq(s.duplicadosDescartados.bId, id)),
      ),
    );
