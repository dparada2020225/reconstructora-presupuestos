import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";
import type { Db } from "../db/tipos";

export type { Db };

/** Cliente HTTP de Neon: sin conexiones abiertas, ideal para Workers. */
export function crearDb(url: string): Db {
  return drizzle(neon(url), { schema });
}
