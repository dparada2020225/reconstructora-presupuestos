/**
 * Aplica las migraciones pendientes (carpeta drizzle/) a la base de PRODUCCIÓN.
 * Correrlo ANTES de hacer push de un cambio que agrega tablas o columnas.
 *
 * Usa el migrador de drizzle-orm directamente (no `drizzle-kit migrate`, que a veces falla sin
 * decir por qué) y muestra qué migraciones aplicó o el error completo.
 *
 * Uso: npm run db:migrate:produccion
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { urlParaScripts } from "./db-url";
import { pedirUrlProduccion } from "./url-produccion";

const url = urlParaScripts(await pedirUrlProduccion());
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
const cliente = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(cliente);

async function aplicadas(): Promise<number> {
  try {
    const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    return Number(r[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

try {
  const antes = await aplicadas();
  console.log(`\nMigraciones en el repo: ${journal.entries.length} · aplicadas en producción: ${antes}`);
  console.log("Aplicando las que falten…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const despues = await aplicadas();
  for (const e of journal.entries.slice(antes, despues)) console.log(`  ✓ ${e.tag}`);
  console.log(despues > antes ? `\n✓ Producción al día (${despues - antes} nuevas). Ya puedes hacer push.` : "\n✓ Producción ya estaba al día.");
} catch (e) {
  const err = e as Error & { cause?: Error & { code?: string; detail?: string } };
  console.error("\n✗ No se pudo migrar producción:");
  console.error(`  ${err.message}`);
  if (err.cause) console.error(`  Causa: ${err.cause.message}${err.cause.code ? ` (código ${err.cause.code})` : ""}${err.cause.detail ? ` — ${err.cause.detail}` : ""}`);
  console.error("\n  Mándale este mensaje completo a quien te ayuda con la app. La base no quedó a medias:");
  console.error("  cada migración corre en una transacción.");
  process.exitCode = 1;
} finally {
  await cliente.end();
}
