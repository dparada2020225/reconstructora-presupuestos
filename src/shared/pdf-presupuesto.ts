/**
 * PDF del presupuesto con el formato de siempre (el de la pestaña FORMATO del Excel):
 * logo, "Lugar y fecha / Cliente / No. Placa / transporte" a la izquierda, correo, empresa y
 * teléfono a la derecha, secciones centradas en negrita, líneas "- descripción……… Q4,500.00",
 * TOTAL de cada sección con fondo verde, resumen, NOTA centrada y firma.
 *
 * Corre en el navegador (se carga solo al descargar) y en Node (tests). Sin datos del negocio:
 * todo lo del membrete viene de los Ajustes guardados en la base.
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { montoTrabajo } from "./estadisticas";
import { descripcionImpresa, lugarYFecha, nombreDocumento, quetzales, type Ajustes, type ItemImpreso } from "./presupuesto";

export type ItemPdf = ItemImpreso;

export interface DocumentoTrabajo {
  id: number;
  tipo: "original" | "extra";
  numero: number;
  total: number;
  cerradoEn: number | null;
  /** Los cancelados no salen en los resúmenes. */
  estado?: string;
}

export interface DatosPdf {
  ajustes: Ajustes;
  id: number;
  tipo: "original" | "extra";
  numero: number;
  cliente: string;
  placa: string | null;
  bus: string | null;
  fecha: string | null;
  lugar: string | null;
  items: ItemPdf[];
  total: number;
  cerradoEn: number | null;
  anticipo: number | null;
  notaPie: string | null;
  /** Original + extras del trabajo (para el resumen al final de un extra). */
  documentosTrabajo: DocumentoTrabajo[];
}

/* Medidas en puntos (carta: 612 × 792). */
const ANCHO = 612;
const ALTO = 792;
const MARGEN = 50;
const ABAJO = 48;
const X_GUION = MARGEN + 6;
const X_TEXTO = MARGEN + 16;
const X_PRECIO = ANCHO - MARGEN - 4; // borde derecho del precio
const ANCHO_PRECIO = 78;
const TAM = 10.5;
const RENGLON = 14.5;
const VERDE = rgb(0x8c / 255, 0xda / 255, 0x1f / 255);
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.35, 0.35, 0.35);

/** Alto de los íconos junto a la empresa y el teléfono (pt). */
const ALTO_ICONO = 13;

async function incrustarLogo(doc: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const m = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  try {
    return m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

export class Lienzo {
  pagina!: PDFPage;
  y = 0;
  paginas: PDFPage[] = [];
  private validos: Set<number>;

  constructor(
    private doc: PDFDocument,
    public normal: PDFFont,
    public negrita: PDFFont,
  ) {
    this.validos = new Set(normal.getCharacterSet());
    this.nuevaPagina();
  }

  nuevaPagina() {
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    this.paginas.push(this.pagina);
    this.y = ALTO - 40;
  }

  /** Asegura `alto` puntos libres; si no caben, pasa a la página siguiente. */
  espacio(alto: number) {
    if (this.y - alto < ABAJO) this.nuevaPagina();
  }

  /** Quita caracteres que la fuente estándar no tiene (emojis, etc.). */
  limpio(t: string): string {
    return [...t.replace(/\s+/g, " ")]
      .map((c) => (this.validos.has(c.codePointAt(0)!) ? c : c === "“" || c === "”" ? '"' : "?"))
      .join("");
  }

  ancho(t: string, f: PDFFont, tam: number) {
    return f.widthOfTextAtSize(t, tam);
  }

  texto(t: string, x: number, opciones: { f?: PDFFont; tam?: number; color?: ReturnType<typeof rgb>; alinear?: "izq" | "der" | "centro" } = {}) {
    const f = opciones.f ?? this.normal;
    const tam = opciones.tam ?? TAM;
    const s = this.limpio(t);
    const w = this.ancho(s, f, tam);
    const xx = opciones.alinear === "der" ? x - w : opciones.alinear === "centro" ? x - w / 2 : x;
    this.pagina.drawText(s, { x: xx, y: this.y, size: tam, font: f, color: opciones.color ?? NEGRO });
    return w;
  }

  /** Parte el texto en renglones que quepan en `max` puntos. */
  partir(t: string, f: PDFFont, tam: number, max: number): string[] {
    const palabras = this.limpio(t).split(" ").filter(Boolean);
    const out: string[] = [];
    let actual = "";
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (this.ancho(prueba, f, tam) <= max || !actual) actual = prueba;
      else {
        out.push(actual);
        actual = p;
      }
    }
    if (actual) out.push(actual);
    return out.length ? out : [""];
  }

  /** Puntos de relleno entre x1 y x2 (como en el Excel). */
  puntos(x1: number, x2: number, f: PDFFont, tam: number) {
    const punto = this.ancho(".", f, tam);
    const n = Math.floor((x2 - x1) / punto);
    if (n > 0) this.pagina.drawText(".".repeat(n), { x: x1, y: this.y, size: tam, font: f, color: NEGRO });
  }

  /** "- descripción………… Q1,000.00". La descripción larga se parte en varios renglones. */
  lineaConPrecio(descripcion: string, precio: string, opciones: { f?: PDFFont; guion?: boolean; fondo?: boolean; xTexto?: number } = {}) {
    const f = opciones.f ?? this.normal;
    const xTexto = opciones.xTexto ?? X_TEXTO;
    const limite = X_PRECIO - ANCHO_PRECIO;
    const renglones = this.partir(descripcion, f, TAM, limite - xTexto - 12);
    this.espacio(RENGLON * renglones.length);
    renglones.forEach((r, i) => {
      if (opciones.fondo && i === renglones.length - 1)
        this.pagina.drawRectangle({ x: xTexto - 4, y: this.y - 3.5, width: X_PRECIO + 3 - (xTexto - 4), height: RENGLON - 1, color: VERDE });
      if (i === 0 && opciones.guion !== false) this.texto("-", X_GUION, { f });
      const w = this.texto(r, xTexto, { f });
      if (i === renglones.length - 1) {
        const wPrecio = precio ? this.ancho(this.limpio(precio), f, TAM) : 0;
        if (precio) {
          this.puntos(xTexto + w + 1, X_PRECIO - Math.max(wPrecio, 40) - 4, f, TAM);
          this.texto(precio, X_PRECIO, { f, alinear: "der" });
        }
      }
      this.y -= RENGLON;
    });
  }

  titulo(t: string) {
    this.espacio(RENGLON * 3);
    this.y -= 8;
    this.texto(t.toUpperCase(), (X_TEXTO + X_PRECIO) / 2, { f: this.negrita, tam: 11, alinear: "centro" });
    this.y -= RENGLON + 1;
  }
}

const precioImpreso = (i: ItemPdf) => (i.precioPendiente ? "?" : i.precio !== null ? quetzales(i.precio) : "");

export function nombreArchivoPdf(d: Pick<DatosPdf, "cliente" | "fecha" | "tipo" | "numero">): string {
  const base = `Presupuesto ${d.cliente}${d.tipo === "extra" ? ` ${nombreDocumento(d).toLowerCase()}` : ""}${d.fecha ? ` ${d.fecha}` : ""}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim()}.pdf`;
}

async function nuevoDocumento(titulo: string, a: Ajustes) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  doc.setAuthor(a.empresa || "Presupuestos");
  doc.setCreator("reconstructora-presupuestos");
  const [normal, negrita] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  return { doc, l: new Lienzo(doc, normal, negrita) };
}

/** Logo centrado, datos a la izquierda, contacto a la derecha y la línea verde (como el Excel). */
async function membrete(doc: PDFDocument, l: Lienzo, a: Ajustes, d: { lugar: string | null; fecha: string | null; cliente: string; placa: string | null; bus: string | null }) {
  const logo = a.logo ? await incrustarLogo(doc, a.logo) : null;
  if (logo) {
    const alto = 68;
    const ancho = Math.min(280, (logo.width / logo.height) * alto);
    const altoReal = (logo.height / logo.width) * ancho;
    l.pagina.drawImage(logo, { x: (ANCHO - ancho) / 2, y: l.y - altoReal + 10, width: ancho, height: altoReal });
    l.y -= altoReal + 12;
  }

  const placaBus = [d.placa, d.bus].filter(Boolean).join(" / ");
  const izquierda: [string, boolean][] = [
    ["Lugar y fecha:", true],
    [lugarYFecha(d.lugar, d.fecha), false],
    ["Cliente:", true],
    [d.cliente, false],
    ["No. Placa / transporte:", true],
    [placaBus, false],
  ];
  // Derecha: correo, empresa (+ íconos de redes) y teléfono (+ ícono). Los íconos van pegados al texto
  // y el grupo queda alineado al margen derecho, como en el Excel.
  const [iconosEmpresa, iconosTelefono] = await Promise.all([
    a.iconosEmpresa ? incrustarLogo(doc, a.iconosEmpresa) : null,
    a.iconosTelefono ? incrustarLogo(doc, a.iconosTelefono) : null,
  ]);
  const derecha: [string, PDFImage | null][] = [
    [a.correo, null],
    [a.empresa, iconosEmpresa],
    [a.telefono ? `Tel: ${a.telefono}` : "", iconosTelefono],
  ];
  const yInicio = l.y;
  izquierda.forEach(([t, b]) => {
    l.texto(t, MARGEN, { f: b ? l.negrita : l.normal, tam: 11 });
    l.y -= 14;
  });
  const yFin = l.y;
  l.y = yInicio;
  for (const [t, icono] of derecha) {
    if (!t && !icono) continue;
    let x = ANCHO - MARGEN;
    if (icono) {
      const alto = ALTO_ICONO;
      const ancho = (icono.width / icono.height) * alto;
      x -= ancho;
      l.pagina.drawImage(icono, { x, y: l.y - 3.5, width: ancho, height: alto });
      x -= 3;
    }
    if (t) l.texto(t, x, { f: l.negrita, tam: 10, alinear: "der" });
    l.y -= 14;
  }
  l.y = yFin - 6;
  l.pagina.drawLine({ start: { x: MARGEN - 6, y: l.y }, end: { x: ANCHO - MARGEN + 6, y: l.y }, thickness: 2.5, color: VERDE });
  l.y -= 12;
}

/**
 * Secciones con sus líneas y TOTAL en verde. Devuelve los totales por sección.
 * `etiquetaUnica`: si hay una sola sección, su TOTAL lleva ese nombre (p. ej. "TOTAL EXTRA 1").
 */
function cuerpo(l: Lienzo, items: ItemPdf[], etiquetaUnica?: string) {
  const padres = items.filter((i) => i.parentId === null).sort((x, y) => x.orden - y.orden || x.id - y.id);
  const hijosDe = new Map<number, ItemPdf[]>();
  for (const i of items) if (i.parentId !== null) hijosDe.set(i.parentId, [...(hijosDe.get(i.parentId) ?? []), i]);

  const secciones: { titulo: string | null; items: ItemPdf[] }[] = [];
  for (const p of padres) {
    const ult = secciones.at(-1);
    if (ult && ult.titulo === p.seccion) ult.items.push(p);
    else secciones.push({ titulo: p.seccion, items: [p] });
  }

  const totales: { titulo: string; total: number }[] = [];
  for (const s of secciones) {
    if (s.titulo) l.titulo(s.titulo);
    let suma = 0;
    for (const it of s.items) {
      l.lineaConPrecio(descripcionImpresa(it), precioImpreso(it));
      suma += it.precioPendiente ? 0 : (it.precio ?? 0);
      for (const h of (hijosDe.get(it.id) ?? []).sort((x, y) => x.orden - y.orden || x.id - y.id)) {
        if (h.precio !== null || h.precioPendiente) {
          l.lineaConPrecio(descripcionImpresa(h), precioImpreso(h), { xTexto: X_TEXTO + 12, guion: false });
          suma += h.precioPendiente ? 0 : (h.precio ?? 0);
        } else {
          for (const r of l.partir(`• ${h.descripcion}`, l.normal, 9.5, X_PRECIO - X_TEXTO - 30)) {
            l.espacio(13);
            l.texto(r, X_TEXTO + 12, { tam: 9.5, color: GRIS });
            l.y -= 13;
          }
        }
      }
    }
    if (secciones.length > 1 || s.titulo || etiquetaUnica) {
      l.lineaConPrecio(secciones.length === 1 && etiquetaUnica ? etiquetaUnica : "TOTAL", quetzales(suma), { f: l.negrita, guion: false, fondo: true });
      totales.push({ titulo: s.titulo ?? "", total: suma });
    }
  }
  return totales;
}

/** RESUMEN por sección (si hay varias) o un TOTAL general, y el "cerrado en". */
function totalDocumento(l: Lienzo, totales: { titulo: string; total: number }[], total: number, cerradoEn: number | null, etiquetaTotal = "TOTAL") {
  if (totales.length > 1) {
    l.titulo("RESUMEN");
    // Si una sección aparece dos veces (p. ej. ADENTRO otra vez en los extras), va sumada.
    const porTitulo = new Map<string, number>();
    for (const t of totales) porTitulo.set(t.titulo || "OTROS", (porTitulo.get(t.titulo || "OTROS") ?? 0) + t.total);
    for (const [titulo, monto] of porTitulo) l.lineaConPrecio(`TOTAL ${titulo}`, quetzales(monto));
    l.lineaConPrecio(etiquetaTotal, quetzales(total), { f: l.negrita, guion: false, fondo: true });
  } else if (!totales.length) {
    l.y -= 4;
    l.lineaConPrecio(etiquetaTotal, quetzales(total), { f: l.negrita, guion: false, fondo: true });
  }
  if (cerradoEn !== null) {
    l.y -= 4;
    l.lineaConPrecio("CERRADO EN", quetzales(cerradoEn), { f: l.negrita, guion: false, fondo: true });
  }
}

/** Original + extras con su total (o "cerrado en") y el total del trabajo. */
function resumenTrabajo(l: Lienzo, docs: DocumentoTrabajo[]) {
  const vigentes = docs.filter((d) => d.estado !== "cancelado").sort((x, y) => x.numero - y.numero);
  l.titulo("RESUMEN DEL TRABAJO");
  for (const doc of vigentes) {
    const nombre = doc.tipo === "original" ? "PRESUPUESTO ORIGINAL" : nombreDocumento(doc).toUpperCase();
    l.lineaConPrecio(doc.cerradoEn !== null ? `${nombre} (cerrado en)` : nombre, quetzales(doc.cerradoEn ?? doc.total));
  }
  const total = montoTrabajo(vigentes).final;
  l.lineaConPrecio("TOTAL DEL TRABAJO", quetzales(total), { f: l.negrita, guion: false, fondo: true });
  return total;
}

function anticipoYSaldo(l: Lienzo, anticipo: number | null, monto: number) {
  if (!anticipo) return;
  l.lineaConPrecio("ANTICIPO", quetzales(anticipo), { guion: false });
  l.lineaConPrecio("SALDO", quetzales(monto - anticipo), { f: l.negrita, guion: false });
}

/** Nota y firma al final; pueden bajar hasta casi el borde para no dejar una hoja solo con ellas. */
function pie(l: Lienzo, a: Ajustes, notaPie: string | null) {
  const nota = (notaPie ?? "").trim() || a.nota;
  const renglonesNota = nota ? l.partir(nota, l.normal, 10, ANCHO - 2 * MARGEN - 40) : [];
  const alto = renglonesNota.length * 13 + (a.firma ? 14 : 0);
  const PISO = 34;
  if (l.y - 22 - alto >= PISO) l.y -= 22;
  else if (l.y - 10 - alto >= PISO) l.y -= 10;
  else {
    l.nuevaPagina();
    l.y -= 10;
  }
  for (const r of renglonesNota) {
    l.texto(r, ANCHO / 2, { tam: 10, alinear: "centro" });
    l.y -= 13;
  }
  if (a.firma) l.texto(a.firma, ANCHO / 2, { f: l.negrita, tam: 10.5, alinear: "centro" });

  if (l.paginas.length > 1)
    l.paginas.forEach((p, i) => {
      const t = `Página ${i + 1} de ${l.paginas.length}`;
      p.drawText(t, { x: ANCHO / 2 - l.normal.widthOfTextAtSize(t, 8) / 2, y: 24, size: 8, font: l.normal, color: GRIS });
    });
}

/** PDF de UN presupuesto (original o extra). */
export async function generarPdf(d: DatosPdf): Promise<Uint8Array> {
  const { doc, l } = await nuevoDocumento(nombreArchivoPdf(d).replace(/\.pdf$/, ""), d.ajustes);
  await membrete(doc, l, d.ajustes, d);
  const secciones = d.items.filter((i) => i.parentId === null).map((i) => i.seccion);
  if (d.tipo === "extra" && !secciones.some((s) => s && /extra/i.test(s))) l.titulo("EXTRAS");
  totalDocumento(l, cuerpo(l, d.items), d.total, d.cerradoEn);
  anticipoYSaldo(l, d.anticipo, d.cerradoEn ?? d.total);
  if (d.tipo === "extra" && d.documentosTrabajo.filter((x) => x.estado !== "cancelado").length > 1) resumenTrabajo(l, d.documentosTrabajo);
  pie(l, d.ajustes, d.notaPie);
  return doc.save();
}

export interface DatosPdfTrabajo {
  ajustes: Ajustes;
  cliente: string;
  placa: string | null;
  bus: string | null;
  lugar: string | null;
  /** Fecha del documento unificado (hoy). */
  fecha: string;
  documentos: (DocumentoTrabajo & { fecha: string | null; items: ItemPdf[]; anticipo: number | null })[];
}

/** Documento unificado: original + Extra 1, 2, 3… (cada uno con sus secciones) y al final el resumen. */
export async function generarPdfTrabajo(d: DatosPdfTrabajo): Promise<Uint8Array> {
  const { doc, l } = await nuevoDocumento(nombreArchivoPdfTrabajo(d).replace(/\.pdf$/, ""), d.ajustes);
  await membrete(doc, l, d.ajustes, d);
  const docs = d.documentos.filter((x) => x.estado !== "cancelado").sort((x, y) => x.numero - y.numero);
  for (const [i, x] of docs.entries()) {
    const nombre = x.tipo === "original" ? "PRESUPUESTO ORIGINAL" : nombreDocumento(x).toUpperCase();
    // Encabezado de cada documento: barra gris con el nombre y la fecha.
    l.espacio(RENGLON * 4);
    l.y -= i === 0 ? 18 : 14;
    l.pagina.drawRectangle({ x: MARGEN - 6, y: l.y - 5, width: ANCHO - 2 * MARGEN + 12, height: 19, color: rgb(0.93, 0.95, 0.97) });
    l.texto(nombre, MARGEN, { f: l.negrita, tam: 11.5 });
    if (x.fecha) l.texto(lugarYFecha(null, x.fecha).replace(/\.$/, ""), ANCHO - MARGEN, { tam: 10, alinear: "der", color: GRIS });
    l.y -= RENGLON + 6;
    totalDocumento(l, cuerpo(l, x.items, `TOTAL ${nombre}`), x.total, x.cerradoEn, `TOTAL ${nombre}`);
  }
  const total = resumenTrabajo(l, docs);
  // Anticipo = lo anotado en cada presupuesto (los abonos del trabajo no salen en el PDF).
  anticipoYSaldo(l, docs.reduce((a, x) => a + (x.anticipo ?? 0), 0) || null, total);
  pie(l, d.ajustes, null);
  return doc.save();
}

export function nombreArchivoPdfTrabajo(d: Pick<DatosPdfTrabajo, "cliente" | "fecha">): string {
  return `${`Trabajo completo ${d.cliente} ${d.fecha}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim()}.pdf`;
}
