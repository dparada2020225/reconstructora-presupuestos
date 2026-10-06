import type ExcelJS from "exceljs";
import { parseFechaEs } from "../../src/shared/fechas";
import { texto, valorCelda } from "./excel";
import { LectorItems, nombreIndicaExtra } from "./lineas";
import type { DocCrudo } from "./tipos";

const NO_SON_PRESUPUESTOS = /^(formato|cuaderno)/i;

/**
 * PRESUPUESTO.xlsx: una pestaña por presupuesto (a veces con varias "páginas"
 * dentro). Encabezado en columna A, descripción en B, precio en D.
 */
export function parseNuevo(wb: ExcelJS.Workbook): DocCrudo[] {
  const docs: DocCrudo[] = [];
  wb.eachSheet((ws) => {
    const nombre = ws.name.trim();
    if (NO_SON_PRESUPUESTOS.test(nombre)) return;
    let pagina = 1;
    const nuevoDoc = (base?: DocCrudo): DocCrudo => ({
      archivo: "nuevo",
      ref: `PRESUPUESTO.xlsx › ${nombre}${pagina > 1 ? ` (pág. ${pagina})` : ""}`,
      pestana: nombre,
      fechaTexto: null,
      fecha: null,
      lugar: null,
      clienteTexto: base?.clienteTexto ?? null,
      transporteTexto: base?.transporteTexto ?? null,
      items: [],
      totalesEscritos: [],
      cerradoEn: null,
      anticipo: null,
      totalSinDesglose: 0,
      resumenes: 0,
      marcadoComoExtra: nombreIndicaExtra(nombre),
      avisos: [],
    });
    let doc = nuevoDoc();
    let lector = new LectorItems(doc);
    const cerrar = () => {
      if (!doc.fecha) doc.avisos.push(`Sin fecha reconocible (${doc.fechaTexto ?? "vacía"})`);
      if (!doc.clienteTexto) doc.avisos.push("Sin nombre de cliente");
      docs.push(doc);
    };

    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const a = texto(row.getCell(1));
      if (a && /lugar y fecha/i.test(a)) {
        const t = texto(ws.getRow(r + 1).getCell(1));
        const fecha = parseFechaEs(t);
        // Una "página" con otra fecha dentro de la misma pestaña es otro documento.
        if (doc.fecha && fecha && fecha !== doc.fecha) {
          cerrar();
          pagina++;
          doc = nuevoDoc(doc);
          lector = new LectorItems(doc);
        }
        if (!doc.fechaTexto && t) {
          doc.fechaTexto = t;
          doc.fecha = fecha;
          doc.lugar = t.split(",")[0]?.trim() || null;
        }
        continue;
      }
      if (a && /^cliente\s*:?$/i.test(a)) {
        const t = texto(ws.getRow(r + 1).getCell(1));
        if (t && !/placa|lugar/i.test(t)) doc.clienteTexto = doc.clienteTexto ?? t;
        r++;
        continue;
      }
      if (a && /placa/i.test(a)) {
        const t = texto(ws.getRow(r + 1).getCell(1));
        if (t && !/lugar y fecha/i.test(t)) doc.transporteTexto = doc.transporteTexto ?? t;
        r++;
        continue;
      }
      lector.fila(r, a, texto(row.getCell(2)), valorCelda(row.getCell(4)));
    }
    cerrar();
  });
  return docs;
}
