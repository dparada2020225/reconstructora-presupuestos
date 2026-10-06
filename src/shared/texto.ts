/** Utilidades de texto compartidas por la app y el ETL. */

/** Minúsculas, sin tildes, sin signos, espacios colapsados. Clave para comparar nombres. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quita los rellenos de puntos/guiones/elipsis que se usan para alinear precios. */
export function limpiarDescripcion(texto: string): string {
  return texto
    .replace(/[.…·_]{3,}.*$/u, "") // "Pintura afuera.........." (y lo que siga)
    .replace(/[\s.…·_-]+$/u, "")
    .replace(/^[\s*•·-]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de Levenshtein. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similitud 0..1 basada en Levenshtein. */
export function similitud(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

/** Capitaliza cada palabra: "juan perez" → "Juan Perez". */
export function titulo(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_, s: string, l: string) => s + l.toUpperCase());
}
