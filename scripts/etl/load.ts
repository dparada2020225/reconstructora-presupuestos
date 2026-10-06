/**
 * Carga ETL_OUT_DIR/historico.json a la base de DATABASE_URL.
 * Antes: npm run db:migrate && npm run etl:parse
 * Uso:   npm run etl:load
 */
import { existsSync, readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema";
import { cargarHistorico } from "./cargar";
import { HISTORICO_JSON } from "./rutas";
import type { Historico } from "./tipos";

const url = process.env.DATABASE_URL;
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
  const r = await cargarHistorico(db, historico);
  console.log(
    `✓ Cargado: ${r.clientes} clientes · ${r.buses} buses · ${r.productos} productos · ${r.trabajos} trabajos · ${r.presupuestos} presupuestos · ${r.items} items`,
  );
} finally {
  await cliente.end();
}
