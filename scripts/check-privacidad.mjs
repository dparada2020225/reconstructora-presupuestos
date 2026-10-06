#!/usr/bin/env node
/**
 * Falla si en git hay archivos que no deben estar en un repo público:
 * Excel/CSV/PDF, .env, llaves de Google, o el JSON del histórico.
 * Corre en CI y se puede usar como pre-commit.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const archivos = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const prohibidos = [
  /\.(xlsx|xls|xlsm|csv|pdf)$/i,
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)\.dev\.vars(\..*)?$/,
  /(^|\/)historico\.json$/,
  /(^|\/)overrides.*\.json$/,
  /service-account.*\.json$/i,
  /-key\.json$/i,
];
const permitidos = [/\.example$/];

const malos = archivos.filter((f) => prohibidos.some((r) => r.test(f)) && !permitidos.some((r) => r.test(f)));

// Llaves privadas pegadas dentro de cualquier archivo de texto
const MARCA = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
const conLlave = archivos.filter((f) => {
  if (/\.(png|ico|jpg|jpeg|webp|woff2?)$/i.test(f) || f.startsWith("node_modules/")) return false;
  try {
    return readFileSync(f, "utf8").includes(MARCA);
  } catch {
    return false;
  }
});

if (malos.length || conLlave.length) {
  console.error("✗ Archivos que NO pueden ir al repo público:");
  for (const f of [...malos, ...conLlave]) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ Privacidad OK (${archivos.length} archivos revisados)`);
