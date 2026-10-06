/**
 * Aplica las migraciones pendientes (carpeta drizzle/) a la base de PRODUCCIÓN.
 * Correrlo ANTES de hacer push de un cambio que agrega tablas o columnas.
 *
 * Uso: npm run db:migrate:produccion
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { pedirUrlProduccion } from "./url-produccion";

const url = await pedirUrlProduccion();
console.log("\nAplicando migraciones en producción…");
const r = spawnSync("npx drizzle-kit migrate", { shell: true, stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("\n✓ Producción al día. Ya puedes hacer push.");
