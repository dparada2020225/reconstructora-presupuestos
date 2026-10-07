/**
 * Qué va en la pestaña de respaldo de Google Sheets, renglón por renglón, con el mismo
 * orden que el PDF: secciones con sus líneas y TOTAL, resumen, cerrado en, anticipo, saldo
 * y (en los extras) el resumen del trabajo. Sin llamadas a Google: eso está en el Worker.
 */
import { montoTrabajo } from "./estadisticas";
import { descripcionImpresa, nombreDocumento, type ItemImpreso } from "./presupuesto";

export interface DocumentoDelTrabajo {
  id: number;
  tipo: "original" | "extra";
  numero: number;
  total: number;
  cerradoEn: number | null;
  estado: string;
}

export interface DatosRespaldo {
  id: number;
  tipo: "original" | "extra";
  numero: number;
  fecha: string | null;
  cliente: string;
  items: ItemImpreso[];
  total: number;
  cerradoEn: number | null;
  anticipo: number | null;
  documentosTrabajo: DocumentoDelTrabajo[];
}

export type Renglon =
  | { tipo: "titulo"; texto: string }
  | { tipo: "item"; texto: string; precio: number | "?" | null }
  | { tipo: "detalle"; texto: string }
  /** Suma (fórmula) de las líneas de la sección actual o de todo el presupuesto. */
  | { tipo: "suma"; texto: string; alcance: "seccion" | "todo" }
  | { tipo: "monto"; texto: string; monto: number; negrita?: boolean; resaltar?: boolean }
  | { tipo: "vacio" };

export function renglonesRespaldo(d: DatosRespaldo): Renglon[] {
  const out: Renglon[] = [];
  const padres = d.items.filter((i) => i.parentId === null).sort((x, y) => x.orden - y.orden || x.id - y.id);
  const hijosDe = new Map<number, ItemImpreso[]>();
  for (const i of d.items) if (i.parentId !== null) hijosDe.set(i.parentId, [...(hijosDe.get(i.parentId) ?? []), i]);

  const secciones: { titulo: string | null; items: ItemImpreso[] }[] = [];
  for (const p of padres) {
    const ult = secciones.at(-1);
    if (ult && ult.titulo === p.seccion) ult.items.push(p);
    else secciones.push({ titulo: p.seccion, items: [p] });
  }
  if (d.tipo === "extra" && !secciones.some((s) => s.titulo && /extra/i.test(s.titulo))) out.push({ tipo: "titulo", texto: "EXTRAS" });

  const precio = (i: ItemImpreso) => (i.precioPendiente ? ("?" as const) : i.precio);
  const totales: { titulo: string; total: number }[] = [];
  for (const [n, s] of secciones.entries()) {
    if (n > 0) out.push({ tipo: "vacio" });
    if (s.titulo) out.push({ tipo: "titulo", texto: s.titulo });
    let suma = 0;
    for (const it of s.items) {
      out.push({ tipo: "item", texto: descripcionImpresa(it), precio: precio(it) });
      suma += it.precioPendiente ? 0 : (it.precio ?? 0);
      for (const h of (hijosDe.get(it.id) ?? []).sort((x, y) => x.orden - y.orden || x.id - y.id)) {
        if (h.precio !== null || h.precioPendiente) {
          out.push({ tipo: "item", texto: `   ${descripcionImpresa(h)}`, precio: precio(h) });
          suma += h.precioPendiente ? 0 : (h.precio ?? 0);
        } else out.push({ tipo: "detalle", texto: `      • ${h.descripcion}` });
      }
    }
    if (secciones.length > 1 || s.titulo) {
      out.push({ tipo: "suma", texto: "TOTAL", alcance: "seccion" });
      totales.push({ titulo: s.titulo ?? "", total: suma });
    }
  }

  if (totales.length > 1) {
    out.push({ tipo: "vacio" }, { tipo: "titulo", texto: "RESUMEN" });
    const porTitulo = new Map<string, number>();
    for (const t of totales) porTitulo.set(t.titulo || "OTROS", (porTitulo.get(t.titulo || "OTROS") ?? 0) + t.total);
    for (const [titulo, monto] of porTitulo) out.push({ tipo: "monto", texto: `TOTAL ${titulo}`, monto });
  }
  if (totales.length !== 1) out.push({ tipo: "suma", texto: "TOTAL", alcance: "todo" });
  if (d.cerradoEn !== null) out.push({ tipo: "monto", texto: "CERRADO EN", monto: d.cerradoEn, negrita: true, resaltar: true });
  if (d.anticipo) {
    out.push({ tipo: "monto", texto: "ANTICIPO", monto: d.anticipo });
    out.push({ tipo: "monto", texto: "SALDO", monto: (d.cerradoEn ?? d.total) - d.anticipo, negrita: true });
  }

  const docs = d.documentosTrabajo.filter((x) => x.estado !== "cancelado").sort((x, y) => x.numero - y.numero);
  if (d.tipo === "extra" && docs.length > 1) {
    out.push({ tipo: "vacio" }, { tipo: "titulo", texto: "RESUMEN DEL TRABAJO" });
    for (const x of docs) {
      const nombre = x.tipo === "original" ? "PRESUPUESTO ORIGINAL" : nombreDocumento(x).toUpperCase();
      out.push({ tipo: "monto", texto: x.cerradoEn !== null ? `${nombre} (cerrado en)` : nombre, monto: x.cerradoEn ?? x.total });
    }
    out.push({ tipo: "monto", texto: "TOTAL DEL TRABAJO", monto: montoTrabajo(docs).final, negrita: true, resaltar: true });
  }
  return out;
}

/** Nombre de la pestaña: "2026-03-02 Juan Pérez Extra 1 #123" (único por el #id; máx. 100). */
export function nombrePestana(d: Pick<DatosRespaldo, "id" | "fecha" | "cliente" | "tipo" | "numero">): string {
  const doc = d.tipo === "original" ? "" : ` ${nombreDocumento(d)}`;
  const limpio = `${d.fecha ?? "sin fecha"} ${d.cliente}${doc}`.replace(/[[\]:*?/\\']/g, " ").replace(/\s+/g, " ").trim();
  const sufijo = ` #${d.id}`;
  return limpio.slice(0, 100 - sufijo.length) + sufijo;
}
