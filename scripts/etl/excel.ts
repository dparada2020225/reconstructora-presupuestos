import ExcelJS from "exceljs";

/** Valor "plano" de una celda: texto, número o null. Resuelve fórmulas y rich text. */
export function valorCelda(cell: ExcelJS.Cell): string | number | null {
  // En celdas combinadas solo cuenta la principal.
  if (cell.isMerged && cell.master !== cell) return null;
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if ("result" in o) {
      const r = o.result;
      if (typeof r === "number" || typeof r === "string") return r;
      return null;
    }
    if (typeof o.text === "string") return o.text;
  }
  return null;
}

export function texto(cell: ExcelJS.Cell): string | null {
  const v = valorCelda(cell);
  if (v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export async function abrirLibro(ruta: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  return wb;
}
