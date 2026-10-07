/**
 * Copia de TODA la base a un archivo JSON, fuera del repo (por defecto ../copias).
 *
 *   npm run db:copia              → la base de .env (desarrollo)
 *   npm run db:copia:produccion   → pide la URL de la rama production
 *
 * Se restaura con `npm run db:restaurar -- <archivo>`. La copia lleva datos del negocio:
 * no se sube al repo ni se comparte.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { exportarBase } from "../src/db/copia-base";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/tipos";
import { urlParaScripts } from "./db-url";
import { pedirUrlProduccion } from "./url-produccion";

const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Carpeta de las copias (COPIAS_DIR o ../copias). Se niega a usar una carpeta dentro del repo público. */
export function carpetaCopias() {
  const crudo = process.env.COPIAS_DIR ?? "../copias";
  const dir = isAbsolute(crudo) ? crudo : resolve(RAIZ_REPO, crudo);
  const rel = relative(RAIZ_REPO, dir);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error(`COPIAS_DIR (${dir}) está dentro del repo. Las copias no pueden quedar en el repo público.`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const produccion = process.argv.includes("--produccion");
const url = urlParaScripts(produccion ? await pedirUrlProduccion() : process.env.DATABASE_URL);
if (!url) {
  console.error("✗ Falta DATABASE_URL en .env");
  process.exit(1);
}
const dir = carpetaCopias();
const cliente = postgres(url, { max: 1 });
try {
  const copia = await exportarBase(drizzle(cliente, { schema }) as unknown as Db);
  const sello = copia.creada.slice(0, 16).replace(/[T:]/g, "-");
  const archivo = join(dir, `copia-base-${produccion ? "produccion" : "dev"}-${sello}.json`);
  writeFileSync(archivo, JSON.stringify(copia));
  console.log(`\n✓ Copia guardada en ${archivo}`);
  for (const [t, xs] of Object.entries(copia.tablas)) console.log(`  ${t.padEnd(24)} ${xs.length}`);
} finally {
  await cliente.end();
}
