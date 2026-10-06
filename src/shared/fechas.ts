import { normalizar } from "./texto";

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Tolera errores de dedo comunes ("olctubre", "octubredel"). */
function buscarMes(texto: string): { mes: number; idx: number } | null {
  let mejor: { mes: number; idx: number } | null = null;
  for (const [nombre, mes] of Object.entries(MESES)) {
    const idx = texto.indexOf(nombre);
    if (idx >= 0 && (!mejor || idx < mejor.idx)) mejor = { mes, idx };
  }
  if (mejor) return mejor;
  if (texto.includes("olctubre")) return { mes: 10, idx: texto.indexOf("olctubre") };
  return null;
}

/**
 * Extrae la fecha de un encabezado tipo
 * "Ciudad Vieja Sacatepéquez, lunes 13 de noviembre del 2023." o "23 de julio del 2,018,".
 * Devuelve "YYYY-MM-DD" o null. Si falta el día usa el 1.
 */
export function parseFechaEs(texto: unknown): string | null {
  if (texto instanceof Date) return texto.toISOString().slice(0, 10);
  if (typeof texto !== "string") return null;
  const t = normalizar(texto.replace(/(\d),(\d{3})/g, "$1$2")); // "2,018" → "2018"
  const m = buscarMes(t);
  if (!m) return null;
  const antes = t.slice(0, m.idx);
  const despues = t.slice(m.idx);
  const anio = despues.match(/(20\d{2})/)?.[1];
  if (!anio) return null;
  const dias = antes.match(/(\d{1,2})\D*$/);
  const dia = dias ? Number(dias[1]) : 1;
  if (dia < 1 || dia > 31) return null;
  return `${anio}-${String(m.mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Diferencia en días entre dos fechas ISO. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
