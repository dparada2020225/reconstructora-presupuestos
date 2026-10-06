/**
 * Convierte montos escritos a mano a número.
 * Acepta: 8000, "Q.8,000,-", "Q,900,-", "Q:6,175,-", "Q1,800,-", "Q.225.-", "Q 1,140.50".
 * Devuelve null si no hay un monto reconocible ("?", "", texto).
 */
export function parseQuetzales(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  let s = valor.trim();
  if (!s) return null;
  s = s.replace(/^q\s*[.:,]?\s*/i, ""); // prefijo Q, Q., Q:, Q,
  s = s.replace(/[.,]?\s*-+\s*$/, ""); // sufijo ",-" / ".-" / "-"
  s = s.replace(/\s+/g, "");
  if (!/^\d[\d,.]*$/.test(s)) return null;
  // Si termina en .dd o ,dd son centavos; el resto de separadores son miles.
  const m = s.match(/^(.*)[.,](\d{2})$/);
  const entero = (m ? m[1] : s).replace(/[.,]/g, "");
  const centavos = m ? m[2] : "00";
  const n = Number(`${entero}.${centavos}`);
  return Number.isFinite(n) ? n : null;
}

/** Busca el último monto con prefijo Q dentro de un texto: "a. 1 solenoide……Q.115,-" → 115. */
export function montoEnTexto(texto: string): number | null {
  const encontrados = [...texto.matchAll(/Q\s*[.:,]?\s*\d[\d,.]*(?:\s*[.,]?-)?/gi)];
  if (!encontrados.length) return null;
  return parseQuetzales(encontrados[encontrados.length - 1][0]);
}

/** Formato para mostrar: 74600 → "Q74,600.00". */
export function formatoQuetzales(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  return `Q${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
