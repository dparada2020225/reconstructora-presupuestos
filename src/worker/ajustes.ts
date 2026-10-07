import { inArray } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";
import { AJUSTES_VACIOS, CLAVES_AJUSTES, type Ajustes } from "../shared/presupuesto";

/** Membrete del PDF guardado en la tabla configuracion (con valores por defecto). */
export async function leerAjustes(db: Db): Promise<Ajustes> {
  const filas = await db.select().from(s.configuracion).where(inArray(s.configuracion.clave, [...CLAVES_AJUSTES]));
  const out: Ajustes = { ...AJUSTES_VACIOS };
  for (const f of filas) if ((CLAVES_AJUSTES as readonly string[]).includes(f.clave)) out[f.clave as keyof Ajustes] = f.valor;
  return out;
}
