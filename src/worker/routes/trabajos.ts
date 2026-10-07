import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import * as s from "../../db/schema";
import type { AppEnv } from "../env";
import { idDe, noEncontrado, soloDefinidos, textoOpcional, trabajosDonde } from "./comun";

const cambio = z.object({
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
    const [t] = await c.var.db.select({ id: s.trabajos.id }).from(s.trabajos).where(eq(s.trabajos.id, id));
    if (!t) throw noEncontrado("Trabajo");
    // El estado del trabajo no se cambia aquí: sale de los estados de sus presupuestos.
    if (!Object.keys(datos).length) return c.json({ ok: true });
    await c.var.db.update(s.trabajos).set(datos).where(eq(s.trabajos.id, id));
    return c.json({ ok: true });
  });
