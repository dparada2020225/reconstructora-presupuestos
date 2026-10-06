/**
 * Deja lista la base de PRODUCCIÓN y se la entrega a la app publicada:
 *   1. Pide la URL de la rama "production" de Neon (se pega en la terminal, no queda guardada).
 *   2. Crea/actualiza las tablas (drizzle-kit migrate) y siembra los usuarios de SEED_USUARIOS.
 *   3. Guarda la URL como secreto DATABASE_URL del Worker (wrangler secret put).
 *
 * Uso: npm run configurar:produccion
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { pedirUrlProduccion } from "./url-produccion";

const correr = (cmd: string, env?: NodeJS.ProcessEnv, input?: string) =>
  spawnSync(cmd, {
    shell: true,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input,
    env: env ?? process.env,
  });

const url = await pedirUrlProduccion();

const envProd = { ...process.env, DATABASE_URL: url };

console.log("\n1/3 Creando tablas en producción…");
if (correr("npx drizzle-kit migrate", envProd).status !== 0) process.exit(1);

console.log("\n2/3 Registrando usuarios iniciales…");
if (correr("npx tsx scripts/seed-usuarios.ts", envProd).status !== 0) process.exit(1);

console.log("\n3/3 Guardando la URL en Cloudflare (secreto DATABASE_URL)…");
const quien = spawnSync("npx wrangler whoami", { shell: true, encoding: "utf8" });
const logueado = quien.status === 0 && !/not authenticated|wrangler login/i.test(`${quien.stdout}${quien.stderr}`);
if (!logueado || process.argv.includes("--login")) {
  console.log("Se abrirá tu navegador para autorizar a wrangler en tu cuenta de Cloudflare.");
  if (correr("npx wrangler login").status !== 0) process.exit(1);
}
if (correr("npx wrangler secret put DATABASE_URL", undefined, url).status !== 0) {
  console.error("✗ No se pudo guardar el secreto. Prueba: npm run configurar:produccion -- --login");
  process.exit(1);
}

console.log("\n✓ Producción lista. Recarga la app publicada: 'Base de datos' debe decir Funcionando.");
