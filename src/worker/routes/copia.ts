import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { CLAVE_ULTIMA_COPIA, contarFilas, esTablaCopia, FILAS_POR_PAGINA, migracionesAplicadas, paginaTabla } from "../../db/copia-base";
import * as s from "../../db/schema";
import type { AppEnv } from "../env";
import { requiereRol } from "../middleware/auth";

async function ultimaCopia(c: { var: AppEnv["Variables"] }) {
  const [r] = await c.var.db.select({ valor: s.configuracion.valor }).from(s.configuracion).where(sql`${s.configuracion.clave} = ${CLAVE_ULTIMA_COPIA}`);
  return r?.valor ?? null;
}

/**
 * Copia de toda la base (solo admin). El navegador pide el resumen, luego cada tabla de a
 * páginas, arma el JSON y al terminar avisa con POST /hecha (para el recordatorio).
 */
export const rutasCopia = new Hono<AppEnv>()
  .use(requiereRol("admin"))
  .get("/", async (c) =>
    c.json({ tablas: await contarFilas(c.var.db), migraciones: await migracionesAplicadas(c.var.db), porPagina: FILAS_POR_PAGINA, ultima: await ultimaCopia(c) }),
  )
  .get("/ultima", async (c) => c.json({ ultima: await ultimaCopia(c) }))
  .get("/:tabla", async (c) => {
    const tabla = c.req.param("tabla");
    if (!esTablaCopia(tabla)) return c.json({ error: "Tabla desconocida" }, 404);
    return c.json({ filas: await paginaTabla(c.var.db, tabla, Number(c.req.query("pagina") ?? 0) || 0) });
  })
  .post("/hecha", async (c) => {
    const ahora = new Date().toISOString();
    await c.var.db
      .insert(s.configuracion)
      .values({ clave: CLAVE_ULTIMA_COPIA, valor: ahora })
      .onConflictDoUpdate({ target: s.configuracion.clave, set: { valor: ahora, actualizadoEn: sql`now()` } });
    return c.json({ ultima: ahora });
  });
