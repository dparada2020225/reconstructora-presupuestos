import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Cualquier driver de Postgres: neon-http en el Worker, postgres-js en scripts, PGlite en tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Corre varias consultas como una sola unidad. neon-http no tiene transacciones
 * interactivas pero sí `batch` (todo o nada); en otros drivers (tests) van en orden.
 * Las consultas se pasan SIN await: los builders de Drizzle no corren hasta entonces.
 */
export async function enLote(db: Db, consultas: PromiseLike<unknown>[]): Promise<void> {
  if (!consultas.length) return;
  const conBatch = db as unknown as { batch?: (q: PromiseLike<unknown>[]) => Promise<unknown> };
  if (typeof conBatch.batch === "function") {
    await conBatch.batch(consultas);
    return;
  }
  for (const q of consultas) await q;
}
