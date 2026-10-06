import { inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import * as s from "../../db/schema";
import type { Db } from "../../db/tipos";
import { AJUSTES_VACIOS, CLAVES_AJUSTES, type Ajustes } from "../../shared/presupuesto";
import type { AppEnv } from "../env";
import { requiereRol } from "../middleware/auth";

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

export async function leerAjustes(db: Db): Promise<Ajustes> {
  const filas = await db.select().from(s.configuracion).where(inArray(s.configuracion.clave, [...CLAVES_AJUSTES]));
  const out: Ajustes = { ...AJUSTES_VACIOS };
  for (const f of filas) if ((CLAVES_AJUSTES as readonly string[]).includes(f.clave)) out[f.clave as keyof Ajustes] = f.valor;
  return out;
}

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
  });
