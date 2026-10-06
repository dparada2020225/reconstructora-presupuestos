import "dotenv/config";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Overrides } from "./tipos";

const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function desdeRepo(p: string) {
  return isAbsolute(p) ? p : resolve(RAIZ_REPO, p);
}

/** Carpeta de los Excel (por defecto, la carpeta padre del repo). */
export const DATA_DIR = desdeRepo(process.env.DATA_DIR ?? "..");
/** Carpeta de salida del ETL (por defecto ../_etl, fuera del repo). */
export const OUT_DIR = desdeRepo(process.env.ETL_OUT_DIR ?? "../_etl");

/** Corta si alguna carpeta de datos cae dentro del repo (el repo es público). */
export function verificarFueraDelRepo() {
  for (const [nombre, dir] of [
    ["DATA_DIR", DATA_DIR],
    ["ETL_OUT_DIR", OUT_DIR],
  ] as const) {
    const rel = relative(RAIZ_REPO, dir);
    const dentro = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    if (dentro && nombre === "ETL_OUT_DIR") {
      throw new Error(`${nombre} (${dir}) está dentro del repo. Los datos no pueden quedar en el repo público.`);
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });
}

export const ARCHIVO_NUEVO = () => join(DATA_DIR, "PRESUPUESTO.xlsx");
export const ARCHIVO_VIEJO = () => join(DATA_DIR, "PRESUPUESTOS VIEJITOS.xlsx");
export const HISTORICO_JSON = () => join(OUT_DIR, "historico.json");

export function leerOverrides(): Overrides {
  const ruta = join(DATA_DIR, "overrides.json");
  if (!existsSync(ruta)) return {};
  return JSON.parse(readFileSync(ruta, "utf8")) as Overrides;
}
