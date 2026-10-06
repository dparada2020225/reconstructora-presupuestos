/**
 * Claves para reconocer el mismo cliente, bus o producto aunque esté escrito distinto.
 * Las usan el ETL (al cargar el histórico) y la app (búsqueda y posibles duplicados).
 */
import { normalizar, similitud } from "./texto";

/* ───────────────────────── Clientes ───────────────────────── */

/** Limpia el nombre tal como se va a mostrar. */
export function limpiarNombreCliente(texto: string): string {
  return texto
    .replace(/\([^)]*\)/g, " ") // "(Capitán)", "(Hijo de …)"
    .replace(/^\s*(otras\s+)?extras?\s+/i, "") // "Extras Pedro Estrella 1"
    .replace(/\s+\d+\s*$/, "") // "Pedro Estrella 2"
    .replace(/[.,]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave para comparar clientes: sin tildes, sin "Transporte(s)/Trans" al inicio. */
export function claveCliente(texto: string): string {
  return normalizar(limpiarNombreCliente(texto))
    .replace(/^(transportes?|trans)\s+/, "transportes ")
    .replace(/\bsociedad anonima\b|\bs a\b/g, "")
    .trim();
}

/* ───────────────────────── Buses ───────────────────────── */

export const RE_PLACA = /\b([A-Z]{1,2})?\s*-?\s*(\d{3})\s*([A-Z]{2}[A-Z0-9])\b/i;

/** "c 123 abc" → "C-123ABC". Si no parece placa, la deja en mayúsculas y sin espacios de más. */
export function normalizarPlaca(texto: string): string {
  const m = texto.match(RE_PLACA);
  if (m && m[0].trim().length >= texto.trim().length - 1)
    return `${m[1] ? `${m[1].toUpperCase()}-` : ""}${m[2]}${m[3].toUpperCase()}`;
  return texto.toUpperCase().replace(/\s+/g, " ").trim();
}

/** "Transporte Lupita" ≡ "Lupita"; "La Estrella" ≡ "Estrella". */
export function claveNombreBus(nombre: string): string {
  return normalizar(nombre)
    .replace(/^(transportes?|trans)\s+/, "")
    .replace(/^(el|la|los|las)\s+/, "")
    .trim();
}

/* ───────────────────────── Productos ───────────────────────── */

const STOP = new Set(["de", "del", "la", "el", "los", "las", "con", "en", "para", "y", "a", "al", "un", "una", "todo", "todos"]);

const SINONIMOS: [RegExp, string][] = [
  [/\bpor fuera\b|\bfuera\b/g, "afuera"],
  [/\bpor dentro\b|\bdentro\b/g, "adentro"],
  [/\bvicera\b|\bviceras\b/g, "visera"],
  [/\bpasa manos\b/g, "pasamanos"],
  [/\bbumper\b/g, "bomper"],
  [/\bwishil\b|\bwindshield\b/g, "parabrisas"],
  [/\bperciana\b/g, "persiana"],
  [/\bestrivo\b/g, "estribo"],
  [/\bazadores\b|\bazadones\b|\basadores\b/g, "asadores"],
  [/\bneulay\b|\bneolay\b/g, "neolay"],
  [/\belectrico\b/g, "electrico"],
];

/** Clave del producto: sin cantidades, sin palabras vacías, con sinónimos comunes. */
export function claveProducto(descripcion: string): string {
  let t = normalizar(descripcion).replace(/^\d+\s+/, "");
  for (const [re, rep] of SINONIMOS) t = t.replace(re, rep);
  return t
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

/* ───────────────────────── Posibles duplicados ───────────────────────── */

export interface ParDuplicado<T> {
  a: T;
  b: T;
  similitud: number;
  motivo: string;
}

/** Clave estable de un par (el id menor primero), para recordar los descartados. */
export const clavePar = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

const PALABRAS_SUELTAS = new Set(["mas", "y", "e", "con"]);

/**
 * Pares que probablemente son lo mismo: se escriben parecido, uno contiene al otro
 * o tienen casi las mismas palabras. Solo sugiere; unir siempre lo decide una persona.
 */
export function posiblesDuplicados<T extends { id: number }>(
  items: T[],
  clave: (t: T) => string,
  descartados: Set<string> = new Set(),
): ParDuplicado<T>[] {
  const claves = items.map((t) => {
    const k = clave(t);
    return { t, k, palabras: new Set(k.split(" ").filter((w) => w && !PALABRAS_SUELTAS.has(w))) };
  });
  const out: ParDuplicado<T>[] = [];
  for (let i = 0; i < claves.length; i++) {
    for (let j = i + 1; j < claves.length; j++) {
      const x = claves[i];
      const y = claves[j];
      if (!x.k || !y.k || descartados.has(clavePar(x.t.id, y.t.id))) continue;
      const largo = Math.max(x.k.length, y.k.length);
      const corto = Math.min(x.k.length, y.k.length);
      let motivo: string | null = null;
      let s = 0;
      if (x.k === y.k) {
        motivo = "se escriben igual";
        s = 1;
      } else if (corto >= 8 && corto / largo >= 0.5 && (x.k.includes(y.k) || y.k.includes(x.k))) {
        motivo = "un nombre contiene al otro";
        s = corto / largo;
      } else if (corto / largo >= 0.75 && (s = similitud(x.k, y.k)) >= 0.8) {
        motivo = "se escriben parecido";
      } else {
        const comunes = [...x.palabras].filter((w) => y.palabras.has(w)).length;
        const union = new Set([...x.palabras, ...y.palabras]).size;
        if (comunes >= 2 && comunes / union >= 0.75) {
          motivo = "tienen casi las mismas palabras";
          s = comunes / union;
        }
      }
      if (motivo) out.push({ a: x.t, b: y.t, similitud: s, motivo });
    }
  }
  return out.sort((p, q) => q.similitud - p.similitud);
}
