import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import * as s from "../../db/schema";
import { hoyGuatemala } from "../../shared/presupuesto";
import type { AppEnv } from "../env";
import { idDe, noEncontrado, soloDefinidos, textoOpcional, trabajosDonde } from "./comun";

const cambio = z.object({
  estado: z.enum(["cotizado", "en_curso", "terminado", "no_concretado"]).optional(),
  titulo: textoOpcional(160),
  notas: textoOpcional(4000),
});

export const rutasTrabajos = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const id = idDe(c);
    const [t] = await trabajosDonde(c.var.db, eq(s.trabajos.id, id));
    if (!t) throw noEncontrado("Trabajo");
    const [extra] = await c.var.db
      .select({ notas: s.trabajos.notas, fechaFin: s.trabajos.fechaFin, origen: s.trabajos.origen })
      .from(s.trabajos)
      .where(eq(s.trabajos.id, id));
    return c.json({ ...t, ...extra });
  })

  .patch("/:id", async (c) => {
    const id = idDe(c);
    const datos = soloDefinidos(cambio.parse(await c.req.json()));
    const [t] = await c.var.db.select({ fechaFin: s.trabajos.fechaFin }).from(s.trabajos).where(eq(s.trabajos.id, id));
    if (!t) throw noEncontrado("Trabajo");
    if (!Object.keys(datos).length) return c.json({ ok: true });
    const fechaFin = datos.estado === "terminado" && !t.fechaFin ? { fechaFin: hoyGuatemala() } : {};
    await c.var.db.update(s.trabajos).set({ ...datos, ...fechaFin }).where(eq(s.trabajos.id, id));
    return c.json({ ok: true });
  });
