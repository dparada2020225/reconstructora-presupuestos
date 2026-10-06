import type ExcelJS from "exceljs";
import { parseQuetzales } from "../../src/shared/dinero";
import { parseFechaEs } from "../../src/shared/fechas";
import { texto, valorCelda } from "./excel";
import { LectorItems, nombreIndicaExtra } from "./lineas";
import type { DocCrudo } from "./tipos";

/** Columnas donde puede venir el precio en la hoja vieja (J casi siempre, a veces E). */
const COLS_PRECIO = [10, 11, 9, 5, 6, 7, 8, 4, 3];

/**
 * PRESUPUESTOS VIEJITOS.xlsx: una sola hoja con ~47 presupuestos uno debajo del
 * otro. Cada bloque empieza en "Lugar y Fecha:". Precios como texto "Q.8,000,-".
 */
export function parseViejo(wb: ExcelJS.Workbook): DocCrudo[] {
  const ws = wb.worksheets[0];
  const docs: DocCrudo[] = [];
  let doc: DocCrudo | null = null;
  let lector: LectorItems | null = null;

  const cerrar = () => {
    if (!doc) return;
    if (!doc.fecha) doc.avisos.push(`Sin fecha reconocible (${doc.fechaTexto ?? "vacía"})`);
    docs.push(doc);
  };

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = texto(row.getCell(1));

    if (a && /lugar y fecha/i.test(a)) {
      cerrar();
      const fechaTexto = texto(ws.getRow(r + 1).getCell(1));
      doc = {
        archivo: "viejo",
        ref: `PRESUPUESTOS VIEJITOS.xlsx › fila ${r}`,
        pestana: null,
        fechaTexto,
        fecha: parseFechaEs(fechaTexto),
        lugar: fechaTexto?.split(/,|\s\d/)[0]?.trim() || null,
        clienteTexto: null,
        transporteTexto: null,
        items: [],
        totalesEscritos: [],
        cerradoEn: null,
        anticipo: null,
        totalSinDesglose: 0,
        resumenes: 0,
        marcadoComoExtra: false,
        avisos: [],
      };
      lector = new LectorItems(doc);
      r++;
      continue;
    }
    if (!doc || !lector) continue;

    if (a && /^cliente/i.test(a)) {
      const t = texto(ws.getRow(r + 1).getCell(1));
      doc.clienteTexto = t;
      doc.marcadoComoExtra = nombreIndicaExtra(t);
      r++;
      continue;
    }
    if (a && /placa/i.test(a)) {
      const t = texto(ws.getRow(r + 1).getCell(1));
      doc.transporteTexto = t && /[\p{L}\d]/u.test(t) ? t : null;
      r++;
      continue;
    }

    let precio: string | number | null = null;
    for (const c of COLS_PRECIO) {
      const v = valorCelda(row.getCell(c));
      if (v === null) continue;
      if (typeof v === "number" || parseQuetzales(v) !== null || String(v).trim() === "?") {
        precio = v;
        break;
      }
    }
    lector.fila(r, a, texto(row.getCell(2)), precio);
  }
  cerrar();
  return docs;
}
