/**
 * Reemplaza TODO el contenido de una base por el de una copia (archivo de `npm run db:copia`
 * o el que se descarga en Ajustes → "Copia de toda la base").
 *
 *   npm run db:restaurar -- <archivo.json>                → a la base de .env (desarrollo)
 *   npm run db:restaurar -- <archivo.json> --produccion   → pide la URL de la rama production
 *
 * Pide escribir RESTAURAR para confirmar. Todo va en una transacción: si algo falla, la base queda
 * como estaba. La base destino debe tener las mismas migraciones que la copia.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { problemaCopia, restaurarBase, type CopiaBase } from "../src/db/copia-base";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/tipos";
import { urlParaScripts } from "./db-url";
import { pedirUrlProduccion } from "./url-produccion";

const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"))?.replace(/^["']|["']$/g, "");
if (!archivo || !existsSync(archivo)) {
  console.error("✗ Uso: npm run db:restaurar -- <archivo.json> [--produccion]");
  process.exit(1);
}
let copia: CopiaBase;
try {
  copia = JSON.parse(readFileSync(archivo, "utf8"));
} catch {
  console.error("✗ Ese archivo no es un JSON válido.");
  process.exit(1);
}
const problema = problemaCopia(copia);
if (problema) {
  console.error(`✗ ${problema}`);
  process.exit(1);
}

const produccion = process.argv.includes("--produccion");
const url = urlParaScripts(produccion ? await pedirUrlProduccion() : process.env.DATABASE_URL);
if (!url) {
  console.error("✗ Falta DATABASE_URL en .env");
  process.exit(1);
}

console.log(`\nCopia del ${new Date(copia.creada).toLocaleString("es-GT")}:`);
for (const [t, xs] of Object.entries(copia.tablas)) console.log(`  ${t.padEnd(24)} ${xs.length}`);
console.log(`\n⚠ Se va a BORRAR todo lo que hay en la base de ${produccion ? "PRODUCCIÓN" : "desarrollo (.env)"} (${new URL(url).hostname}) y poner lo de la copia.`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ok = (await rl.question('Escribe RESTAURAR para seguir: ')).trim() === "RESTAURAR";
rl.close();
if (!ok) {
  console.log("No se cambió nada.");
  process.exit(0);
}

const cliente = postgres(url, { max: 1 });
try {
  await restaurarBase(drizzle(cliente, { schema }) as unknown as Db, copia);
  console.log("\n✓ Base restaurada.");
} catch (e) {
  console.error(`\n✗ ${(e as Error).message}\n  La base quedó como estaba.`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
