import { claveCliente, claveNombreBus, claveProducto, limpiarNombreCliente, RE_PLACA } from "../../src/shared/claves";
import { similitud, titulo } from "../../src/shared/texto";

export { claveCliente, claveNombreBus, claveProducto, limpiarNombreCliente };

/* ───────────────────────── Clientes ───────────────────────── */

/** Separa "Pedro López - Transportes Estrella" en persona y transporte. */
export function separarClienteTransporte(texto: string): { cliente: string; transporte: string | null } {
  const partes = texto.split(/\s+-\s+|-(?=\s*transp)/i);
  if (partes.length >= 2 && /^\s*(trans|chicken|bus)/i.test(partes.slice(1).join(" - "))) {
    return { cliente: partes[0].trim(), transporte: partes.slice(1).join(" - ").trim() };
  }
  return { cliente: texto.trim(), transporte: null };
}

export interface SugerenciaFusion {
  a: string;
  b: string;
  similitud: number;
  motivo: string;
}

/** Pares de clientes que se parecen (solo sugerencia, nunca se fusionan solos). */
export function sugerirFusiones(claves: string[]): SugerenciaFusion[] {
  const out: SugerenciaFusion[] = [];
  for (let i = 0; i < claves.length; i++) {
    for (let j = i + 1; j < claves.length; j++) {
      const a = claves[i];
      const b = claves[j];
      const s = similitud(a, b);
      if (s >= 0.8) out.push({ a, b, similitud: s, motivo: "se escriben parecido" });
      else if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a)))
        out.push({ a, b, similitud: s, motivo: "un nombre contiene al otro" });
    }
  }
  return out.sort((x, y) => y.similitud - x.similitud);
}

/* ───────────────────────── Buses ───────────────────────── */

/** Descripciones que dicen qué tipo de vehículo es, no cuál bus es. */
const SOLO_DESCRIPCION = /carrocer|\bford\b|\bkia\b|blue ?bird|international|^usa$|restaurante|porta ?contenedor/i;

export interface BusDetectado {
  placa: string | null;
  nombre: string | null;
  descripcion: string | null;
}

export function detectarBus(texto: string | null): BusDetectado | null {
  if (!texto) return null;
  let resto = texto.trim();
  if (!/[\p{L}\d]/u.test(resto) || /^-+$/.test(resto)) return null;

  let placa: string | null = null;
  const m = resto.match(RE_PLACA);
  if (m) {
    placa = `${m[1] ? `${m[1].toUpperCase()}-` : ""}${m[2]}${m[3].toUpperCase()}`;
    resto = resto.replace(m[0], " ");
  }
  resto = resto
    .replace(/^[\s\-–/|]+|[\s\-–/|.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  let nombre: string | null = resto || null;
  let descripcion: string | null = null;
  if (nombre && SOLO_DESCRIPCION.test(nombre)) {
    descripcion = nombre;
    nombre = null;
  }
  if (nombre) nombre = nombre.replace(/\(([^)]*)\)/g, "$1").trim();
  if (!placa && !nombre && !descripcion) return null;
  return { placa, nombre: nombre ? titulo(nombre) : null, descripcion };
}

/* ───────────────────────── Productos ───────────────────────── */

/**
 * Agrupa claves parecidas (≥0.88) en un mismo producto. Devuelve clave → representante.
 * Determinista: procesa de la más frecuente a la menos.
 */
export function agruparProductos(frecuencias: Map<string, number>): Map<string, string> {
  const ordenadas = [...frecuencias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const representantes: string[] = [];
  const mapa = new Map<string, string>();
  for (const [clave] of ordenadas) {
    let rep = representantes.find((r) => similitud(r, clave) >= 0.88);
    if (!rep) {
      representantes.push(clave);
      rep = clave;
    }
    mapa.set(clave, rep);
  }
  return mapa;
}

export { categoriaDeSeccion } from "../../src/shared/categorias";
