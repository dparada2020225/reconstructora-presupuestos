import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";

/** Cliente HTTP de Neon: sin conexiones abiertas, ideal para Workers. */
export function crearDb(url: string) {
  return drizzle(neon(url), { schema });
}

export type Db = ReturnType<typeof crearDb>;
