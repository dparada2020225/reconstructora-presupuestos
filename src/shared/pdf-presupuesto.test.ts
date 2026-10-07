import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generarPdf, generarPdfTrabajo, nombreArchivoPdf, nombreArchivoPdfTrabajo, type DatosPdf } from "./pdf-presupuesto";
import { AJUSTES_VACIOS } from "./presupuesto";

/** Datos inventados. */
const item = (id: number, seccion: string | null, descripcion: string, precio: number | null, extra: Partial<DatosPdf["items"][number]> = {}) => ({
  id, parentId: null, orden: id, seccion, descripcion, cantidad: 1, precioUnitario: precio, precio, precioPendiente: false, ...extra,
});

const datos = (n: number, extra: Partial<DatosPdf> = {}): DatosPdf => ({
  ajustes: { ...AJUSTES_VACIOS, empresa: "Taller de Prueba", correo: "taller@ejemplo.com", telefono: "0000-0000", firma: "Firma Inventada", lugar: "Pueblo" },
  id: 1, tipo: "original", numero: 0, cliente: "Cliente Inventado 🚌", placa: "C-123ABC", bus: "La Prueba", fecha: "2026-03-02", lugar: "Pueblo",
  items: [
    ...Array.from({ length: n }, (_, i) => item(i + 1, i % 2 ? "AFUERA" : "ADENTRO", `Trabajo número ${i + 1} con una descripción bastante larga para que tenga que partirse en dos renglones del PDF`, 1000)),
    item(1000, "ADENTRO", "Sillas", 1800, { cantidad: 4, precioUnitario: 450 }),
    { ...item(1001, "ADENTRO", "Tapizado azul", null), parentId: 1000 },
    item(1002, "ADENTRO", "Luces", null, { precioPendiente: true }),
  ],
  total: n * 1000 + 1800, cerradoEn: 5000, anticipo: 1000, notaPie: null, documentosTrabajo: [],
  ...extra,
});

describe("PDF del presupuesto", () => {
  it("genera un PDF válido, con varias páginas si hace falta", async () => {
    const corto = await PDFDocument.load(await generarPdf(datos(3)));
    expect(corto.getPageCount()).toBe(1);
    const largo = await PDFDocument.load(await generarPdf(datos(80)));
    expect(largo.getPageCount()).toBeGreaterThan(2);
  });

  it("extra con resumen del trabajo y logo inválido sin romperse", async () => {
    const pdf = await generarPdf(datos(2, {
      tipo: "extra", numero: 1, ajustes: { ...AJUSTES_VACIOS, logo: "data:image/png;base64,AAAA" },
      documentosTrabajo: [{ id: 9, tipo: "original", numero: 0, total: 10000, cerradoEn: 9000 }, { id: 1, tipo: "extra", numero: 1, total: 3800, cerradoEn: null }],
    }));
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it("documento unificado: original + extras, sin cancelados", async () => {
    const d = datos(5);
    const doc = (id: number, numero: number, estado: string) => ({
      id, tipo: numero ? ("extra" as const) : ("original" as const), numero, total: 1000, cerradoEn: null, estado, fecha: "2026-03-02", items: d.items,
    });
    const pdf = await generarPdfTrabajo({
      ajustes: d.ajustes, cliente: "Cliente Inventado", placa: null, bus: "La Prueba", lugar: "Pueblo", fecha: "2026-04-01", abonado: 500,
      documentos: [doc(1, 0, "terminado"), doc(2, 1, "en_curso"), doc(3, 2, "cancelado")],
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(2);
    expect(nombreArchivoPdfTrabajo({ cliente: "Ana", fecha: "2026-04-01" })).toBe("Trabajo completo Ana 2026-04-01.pdf");
  });

  it("nombre del archivo", () => {
    expect(nombreArchivoPdf({ cliente: "Ana / Pérez", fecha: "2026-03-02", tipo: "extra", numero: 2 })).toBe("Presupuesto Ana Pérez extra 2 2026-03-02.pdf");
  });
});
