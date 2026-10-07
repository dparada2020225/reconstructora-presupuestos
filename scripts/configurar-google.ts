/**
 * Configura el respaldo en Google Sheets sin copiar llaves a mano:
 *   1. Pide la ruta del archivo .json de la cuenta de servicio (se puede arrastrar a la terminal).
 *   2. Pide el link del archivo de Sheets de respaldo (el que tiene la pestaña FORMATO).
 *   3. Escribe GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY y SHEETS_RESPALDO_ID en .dev.vars (local)
 *      y los guarda como secretos del Worker en Cloudflare (producción).
 * La llave privada nunca se imprime ni se guarda en el repo.
 *
 * Uso: npm run configurar:google
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

// Las respuestas se leen línea por línea (funciona igual escribiendo o pegando varias de una vez).
const rl = createInterface({ input: process.stdin });
const lineas = rl[Symbol.asyncIterator]();
async function preguntar(texto: string) {
  process.stdout.write(texto);
  const r = await lineas.next();
  return r.done ? "" : String(r.value);
}
const sinComillas = (t: string) => t.trim().replace(/^["'&\s]+|["'\s]+$/g, "");

console.log("\n1/3 Archivo de la llave (.json) de la cuenta de servicio.");
console.log("    Puedes arrastrar el archivo a esta ventana y dar Enter.\n");
const ruta = sinComillas(await preguntar("Ruta del .json: "));
if (!existsSync(ruta)) {
  console.error(`✗ No encuentro el archivo: ${ruta}`);
  process.exit(1);
}
let cuenta: { client_email?: string; private_key?: string; type?: string };
try {
  cuenta = JSON.parse(readFileSync(ruta, "utf8"));
} catch {
  console.error("✗ Ese archivo no es un JSON válido.");
  process.exit(1);
}
if (cuenta.type !== "service_account" || !cuenta.client_email || !cuenta.private_key?.includes("PRIVATE KEY")) {
  console.error("✗ Ese JSON no es la llave de una cuenta de servicio (falta client_email o private_key).");
  process.exit(1);
}

console.log("\n2/3 Link del archivo de Google Sheets de respaldo (el que tiene la pestaña FORMATO).\n");
const link = sinComillas(await preguntar("Link de Sheets: "));
rl.close();
const id = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)?.[1] ?? (/^[a-zA-Z0-9_-]{20,}$/.test(link) ? link : null);
if (!id) {
  console.error("✗ No reconozco ese link. Debe verse como https://docs.google.com/spreadsheets/d/…/edit");
  process.exit(1);
}

const valores: Record<string, string> = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: cuenta.client_email,
  // En .dev.vars la llave va en una sola línea con \n; el Worker los vuelve saltos de línea.
  GOOGLE_PRIVATE_KEY: cuenta.private_key.replace(/\r?\n/g, "\\n"),
  SHEETS_RESPALDO_ID: id,
};

/* .dev.vars (local) */
const archivoVars = ".dev.vars";
let vars = existsSync(archivoVars) ? readFileSync(archivoVars, "utf8") : "";
for (const [k, v] of Object.entries(valores)) {
  const linea = `${k}="${v}"`;
  const re = new RegExp(`^#?\\s*${k}=.*$`, "m");
  vars = re.test(vars) ? vars.replace(re, () => linea) : `${vars.trimEnd()}\n${linea}\n`;
}
writeFileSync(archivoVars, vars);
console.log("\n✓ Guardado en .dev.vars (local).");

/* Secretos del Worker (producción) */
console.log("\n3/3 Guardando los secretos en Cloudflare…");
const quien = spawnSync("npx wrangler whoami", { shell: true, encoding: "utf8" });
if (quien.status !== 0 || /not authenticated|wrangler login/i.test(`${quien.stdout}${quien.stderr}`)) {
  console.log("Se abrirá tu navegador para autorizar a wrangler en tu cuenta de Cloudflare.");
  if (spawnSync("npx wrangler login", { shell: true, stdio: "inherit" }).status !== 0) process.exit(1);
}
for (const [k, v] of Object.entries(valores)) {
  const valor = k === "GOOGLE_PRIVATE_KEY" ? cuenta.private_key : v;
  const r = spawnSync(`npx wrangler secret put ${k}`, { shell: true, input: valor, stdio: ["pipe", "inherit", "inherit"] });
  if (r.status !== 0) {
    console.error(`✗ No se pudo guardar ${k} en Cloudflare.`);
    process.exit(1);
  }
}

console.log(`
✓ Listo. Falta un paso en Google Sheets si no lo hiciste:
  Comparte el archivo de respaldo (botón "Compartir") con este correo, como Editor:

    ${cuenta.client_email}

  Después, en la app: Ajustes → "Respaldo en Google Sheets" → Copiar pendientes.
`);
