/**
 * Carga ETL_OUT_DIR/historico.json a la base.
 * Antes: npm run db:migrate && npm run etl:parse
 * Uso:   npm run etl:load              → base de .env (desarrollo)
 *        npm run etl:load:produccion   → pide la URL de la rama production
 */
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema";
import { urlParaScripts } from "../db-url";
import { cargarHistorico } from "./cargar";
import { HISTORICO_JSON } from "./rutas";
import type { Historico } from "./tipos";

const hostDe = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
};

let crudo = process.env.DATABASE_URL ?? "";
if (process.argv.includes("--produccion")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nPega la URL de la rama *production* de Neon (Connect → production → pooling apagado → Copy snippet)");
  const prod = (await rl.question("URL: ")).trim().replace(/^["']|["']$/g, "");
  rl.close();
  if (!/^postgres(ql)?:\/\/.+@.+\/.+/.test(prod) || hostDe(prod) === hostDe(crudo)) {
    console.error("✗ Esa no es la URL de production (o es la misma de .env). No se cargó nada.");
    process.exit(1);
  }
  crudo = prod;
}
const url = urlParaScripts(crudo);
if (!url) {
  console.error("Falta DATABASE_URL en .env");
  process.exit(1);
}
if (!existsSync(HISTORICO_JSON())) {
  console.error(`No existe ${HISTORICO_JSON()}. Corre primero: npm run etl:parse`);
  process.exit(1);
}

const historico = JSON.parse(readFileSync(HISTORICO_JSON(), "utf8")) as Historico;
const cliente = postgres(url, { max: 1 });
try {
  const db = drizzle(cliente, { schema });
  const inicio = Date.now();
  const r = await cargarHistorico(db, historico, (m) => console.log(`  ${m}`));
  console.log(
    `✓ Cargado en ${((Date.now() - inicio) / 1000).toFixed(1)} s: ${r.clientes} clientes · ${r.buses} buses · ${r.productos} productos · ${r.trabajos} trabajos · ${r.presupuestos} presupuestos · ${r.items} items`,
  );
} finally {
  await cliente.end();
}
