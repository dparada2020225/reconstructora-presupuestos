import { and, asc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import * as s from "../../db/schema";
import { leerAjustes } from "../ajustes";
import type { AppEnv } from "../env";
import { requiereRol } from "../middleware/auth";
import { condicionPendiente, contarPendientes, googleConfigurado, respaldarPresupuesto } from "../respaldo";

const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const cambio = z
  .object({
    empresa: texto(120),
    correo: texto(120),
    telefono: texto(60),
    firma: texto(120),
    nota: texto(600),
    lugar: texto(160),
    logo: z
      .string()
      .max(700_000, "El logo es muy pesado (máximo ~500 KB)")
      .refine((v) => v === "" || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v), "El logo debe ser PNG o JPG"),
  })
  .partial();

/** Membrete del PDF. Lo leen todos; solo el admin lo cambia. */
export const rutasConfiguracion = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await leerAjustes(c.var.db)))
  .put("/", requiereRol("admin"), async (c) => {
    const datos = cambio.parse(await c.req.json());
    const filas = Object.entries(datos).map(([clave, valor]) => ({ clave, valor: valor as string }));
    if (filas.length)
      await c.var.db
        .insert(s.configuracion)
        .values(filas)
        .onConflictDoUpdate({ target: s.configuracion.clave, set: { valor: sql`excluded.valor`, actualizadoEn: sql`now()` } });
    return c.json(await leerAjustes(c.var.db));
  })

  /** Estado del respaldo en Google Sheets. */
  .get("/respaldo", async (c) => {
    const [{ n }] = await contarPendientes(c.var.db);
    return c.json({ configurado: googleConfigurado(c.env), pendientes: n });
  })

  /** Respalda los pendientes (de a 5 por vez para no pasarse del tiempo del Worker). */
  .post("/respaldo/pendientes", async (c) => {
    if (!googleConfigurado(c.env)) return c.json({ error: "El respaldo en Google Sheets todavía no está configurado" }, 503);
    const ids = await c.var.db.select({ id: s.presupuestos.id }).from(s.presupuestos).where(condicionPendiente).orderBy(asc(s.presupuestos.id)).limit(5);
    const errores: string[] = [];
    for (const { id } of ids) await respaldarPresupuesto(c.var.db, c.env, id).catch((e: Error) => errores.push(`#${id}: ${e.message}`));
    const [{ n }] = await contarPendientes(c.var.db);
    return c.json({ hechos: ids.length - errores.length, errores, pendientes: n });
  })

  /** Marca todos los presupuestos de la app como pendientes (para volver a copiarlos, p. ej. tras cambiar la plantilla). */
  .post("/respaldo/rehacer", requiereRol("admin"), async (c) => {
    await c.var.db
      .update(s.presupuestos)
      .set({ respaldadoEn: null })
      .where(and(eq(s.presupuestos.origen, "app"), ne(s.presupuestos.estado, "borrador")));
    const [{ n }] = await contarPendientes(c.var.db);
    return c.json({ configurado: googleConfigurado(c.env), pendientes: n });
  });
