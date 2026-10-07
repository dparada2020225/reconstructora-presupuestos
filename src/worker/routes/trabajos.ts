import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import * as s from "../../db/schema";
import { FORMAS_PAGO } from "../../shared/estados";
import type { AppEnv } from "../env";
import { idDe, noEncontrado, soloDefinidos, textoOpcional, trabajosDonde } from "./comun";

const cambio = z.object({
  titulo: textoOpcional(160),
  notas: textoOpcional(4000),
});

const pago = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  monto: z.number().positive("El monto debe ser mayor que 0").max(1_000_000_000),
  forma: z.enum(FORMAS_PAGO).nullable(),
  nota: textoOpcional(300),
});

async function existeTrabajo(c: { var: AppEnv["Variables"] }, id: number) {
  const [t] = await c.var.db.select({ id: s.trabajos.id }).from(s.trabajos).where(eq(s.trabajos.id, id));
  if (!t) throw noEncontrado("Trabajo");
}

export const rutasTrabajos = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const id = idDe(c);
    const [t] = await trabajosDonde(c.var.db, eq(s.trabajos.id, id));
    if (!t) throw noEncontrado("Trabajo");
    const [[extra], pagos] = await Promise.all([
      c.var.db
        .select({ notas: s.trabajos.notas, fechaFin: s.trabajos.fechaFin, origen: s.trabajos.origen })
        .from(s.trabajos)
        .where(eq(s.trabajos.id, id)),
      c.var.db
        .select({ id: s.pagos.id, fecha: s.pagos.fecha, monto: s.pagos.monto, forma: s.pagos.forma, nota: s.pagos.nota, creadoPor: s.usuarios.nombre })
        .from(s.pagos)
        .leftJoin(s.usuarios, eq(s.usuarios.id, s.pagos.creadoPor))
        .where(eq(s.pagos.trabajoId, id))
        .orderBy(asc(s.pagos.fecha), asc(s.pagos.id)),
    ]);
    return c.json({ ...t, ...extra, pagos: pagos.map((g) => ({ ...g, monto: Number(g.monto) })) });
  })

  .patch("/:id", async (c) => {
    const id = idDe(c);
    const datos = soloDefinidos(cambio.parse(await c.req.json()));
    await existeTrabajo(c, id);
    // El estado del trabajo no se cambia aquí: sale de los estados de sus presupuestos.
    if (!Object.keys(datos).length) return c.json({ ok: true });
    await c.var.db.update(s.trabajos).set(datos).where(eq(s.trabajos.id, id));
    return c.json({ ok: true });
  })

  /* ───── Abonos del trabajo (no salen en el PDF) ───── */
  .post("/:id/pagos", async (c) => {
    const id = idDe(c);
    const d = pago.parse(await c.req.json());
    await existeTrabajo(c, id);
    await c.var.db
      .insert(s.pagos)
      .values({ trabajoId: id, fecha: d.fecha, monto: d.monto.toFixed(2), forma: d.forma, nota: d.nota ?? null, creadoPor: c.var.usuario.id });
    return c.json({ ok: true }, 201);
  })
  .patch("/:id/pagos/:pagoId", async (c) => {
    const id = idDe(c);
    const pagoId = idDe(c, "pagoId");
    const d = pago.parse(await c.req.json());
    const [r] = await c.var.db
      .update(s.pagos)
      .set({ fecha: d.fecha, monto: d.monto.toFixed(2), forma: d.forma, nota: d.nota ?? null })
      .where(and(eq(s.pagos.id, pagoId), eq(s.pagos.trabajoId, id)))
      .returning({ id: s.pagos.id });
    if (!r) throw noEncontrado("Abono");
    return c.json({ ok: true });
  })
  .delete("/:id/pagos/:pagoId", async (c) => {
    const id = idDe(c);
    const pagoId = idDe(c, "pagoId");
    const [r] = await c.var.db
      .delete(s.pagos)
      .where(and(eq(s.pagos.id, pagoId), eq(s.pagos.trabajoId, id)))
      .returning({ id: s.pagos.id });
    if (!r) throw noEncontrado("Abono");
    return c.json({ ok: true });
  });
