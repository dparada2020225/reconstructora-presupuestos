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
import { lugarYFecha, nombreDocumento, quetzales, type Ajustes } from "./presupuesto";

export interface ItemPdf {
  id: number;
  parentId: number | null;
  orden: number;
  seccion: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number | null;
  precio: number | null;
  precioPendiente: boolean;
}

export interface DocumentoTrabajo {
  id: number;
  tipo: "original" | "extra";
  numero: number;
  total: number;
  cerradoEn: number | null;
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
const LINEA = rgb(0.75, 0.75, 0.75);

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

class Lienzo {
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

/** Descripción como se imprime: con la cantidad adelante si no la trae y el precio por unidad. */
function descripcionImpresa(i: ItemPdf): string {
  let d = i.descripcion.trim();
  const cant = Number.isInteger(i.cantidad) ? String(i.cantidad) : String(i.cantidad).replace(".", ",");
  if (i.cantidad !== 1 && !d.startsWith(`${cant} `) && !d.startsWith(`${i.cantidad} `))
    // "Sillas nuevas" × 4 → "4 sillas nuevas"
    d = `${cant} ${/^\p{Lu}\p{Ll}/u.test(d) ? d.charAt(0).toLowerCase() + d.slice(1) : d}`;
  // El precio por unidad solo si es exacto (no "Q141.67 c/u" de un total repartido).
  const exacto = i.precioUnitario !== null && i.precio !== null && Math.round(i.precioUnitario * i.cantidad * 100) === Math.round(i.precio * 100);
  if (i.cantidad !== 1 && exacto && !i.precioPendiente) d += ` (${quetzales(i.precioUnitario!)} c/u)`;
  return d;
}

const precioImpreso = (i: ItemPdf) => (i.precioPendiente ? "?" : i.precio !== null ? quetzales(i.precio) : "");

export function nombreArchivoPdf(d: Pick<DatosPdf, "cliente" | "fecha" | "tipo" | "numero">): string {
  const base = `Presupuesto ${d.cliente}${d.tipo === "extra" ? ` ${nombreDocumento(d).toLowerCase()}` : ""}${d.fecha ? ` ${d.fecha}` : ""}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim()}.pdf`;
}

export async function generarPdf(d: DatosPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(nombreArchivoPdf(d).replace(/\.pdf$/, ""));
  doc.setAuthor(d.ajustes.empresa || "Presupuestos");
  doc.setCreator("reconstructora-presupuestos");
  const [normal, negrita] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  const l = new Lienzo(doc, normal, negrita);
  const a = d.ajustes;

  /* ───── Membrete ───── */
  const logo = a.logo ? await incrustarLogo(doc, a.logo) : null;
  if (logo) {
    const alto = 58;
    const ancho = Math.min(240, (logo.width / logo.height) * alto);
    const altoReal = (logo.height / logo.width) * ancho;
    l.pagina.drawImage(logo, { x: MARGEN, y: l.y - altoReal + 10, width: ancho, height: altoReal });
    l.y -= altoReal + 10;
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
  const derecha = [a.correo, a.empresa, a.telefono ? `Tel: ${a.telefono}` : ""].filter(Boolean);
  const yInicio = l.y;
  izquierda.forEach(([t, b]) => {
    l.texto(t, MARGEN, { f: b ? negrita : normal, tam: 11 });
    l.y -= 14;
  });
  const yFin = l.y;
  l.y = yInicio;
  for (const t of derecha) {
    l.texto(t, ANCHO - MARGEN, { f: negrita, tam: 10, alinear: "der" });
    l.y -= 14;
  }
  l.y = yFin - 4;
  l.pagina.drawLine({ start: { x: MARGEN, y: l.y }, end: { x: ANCHO - MARGEN, y: l.y }, thickness: 0.8, color: LINEA });
  l.y -= 12;

  /* ───── Líneas por sección ───── */
  const padres = d.items.filter((i) => i.parentId === null).sort((x, y) => x.orden - y.orden || x.id - y.id);
  const hijosDe = new Map<number, ItemPdf[]>();
  for (const i of d.items) if (i.parentId !== null) hijosDe.set(i.parentId, [...(hijosDe.get(i.parentId) ?? []), i]);

  const secciones: { titulo: string | null; items: ItemPdf[] }[] = [];
  for (const p of padres) {
    const ult = secciones.at(-1);
    if (ult && ult.titulo === p.seccion) ult.items.push(p);
    else secciones.push({ titulo: p.seccion, items: [p] });
  }
  if (d.tipo === "extra" && !secciones.some((s) => s.titulo && /extra/i.test(s.titulo))) l.titulo("EXTRAS");

  const totalesSeccion: { titulo: string; total: number }[] = [];
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
          const renglones = l.partir(`• ${h.descripcion}`, normal, 9.5, X_PRECIO - X_TEXTO - 30);
          for (const r of renglones) {
            l.espacio(13);
            l.texto(r, X_TEXTO + 12, { tam: 9.5, color: GRIS });
            l.y -= 13;
          }
        }
      }
    }
    if (secciones.length > 1 || s.titulo) {
      l.lineaConPrecio("TOTAL", quetzales(suma), { f: negrita, guion: false, fondo: true });
      totalesSeccion.push({ titulo: s.titulo ?? "", total: suma });
    }
  }

  /* ───── Resumen / total general ───── */
  const conTitulo = totalesSeccion.filter((t) => t.titulo);
  if (totalesSeccion.length > 1) {
    l.titulo("RESUMEN");
    // Si una sección aparece dos veces (p. ej. ADENTRO otra vez en los extras), va sumada.
    const porTitulo = new Map<string, number>();
    for (const t of totalesSeccion) porTitulo.set(t.titulo || "OTROS", (porTitulo.get(t.titulo || "OTROS") ?? 0) + t.total);
    for (const [titulo, total] of porTitulo) l.lineaConPrecio(`TOTAL ${titulo}`, quetzales(total));
    l.lineaConPrecio("TOTAL", quetzales(d.total), { f: negrita, guion: false, fondo: true });
  } else if (!conTitulo.length) {
    l.y -= 4;
    l.lineaConPrecio("TOTAL", quetzales(d.total), { f: negrita, guion: false, fondo: true });
  }
  if (d.cerradoEn !== null) {
    l.y -= 4;
    l.lineaConPrecio("CERRADO EN", quetzales(d.cerradoEn), { f: negrita, guion: false, fondo: true });
  }
  if (d.anticipo !== null) {
    l.lineaConPrecio("ANTICIPO", quetzales(d.anticipo), { guion: false });
    l.lineaConPrecio("SALDO", quetzales((d.cerradoEn ?? d.total) - d.anticipo), { f: negrita, guion: false });
  }

  /* ───── Resumen del trabajo (en los extras) ───── */
  const docs = [...d.documentosTrabajo].sort((x, y) => x.numero - y.numero);
  if (d.tipo === "extra" && docs.length > 1) {
    l.titulo("RESUMEN DEL TRABAJO");
    for (const doc of docs) {
      const nombre = doc.tipo === "original" ? "PRESUPUESTO ORIGINAL" : nombreDocumento(doc).toUpperCase();
      l.lineaConPrecio(doc.cerradoEn !== null ? `${nombre} (cerrado en)` : nombre, quetzales(doc.cerradoEn ?? doc.total));
    }
    l.lineaConPrecio("TOTAL DEL TRABAJO", quetzales(montoTrabajo(docs).final), { f: negrita, guion: false, fondo: true });
  }

  /* ───── Nota y firma ───── */
  const nota = (d.notaPie ?? "").trim() || a.nota;
  const renglonesNota = nota ? l.partir(nota, normal, 10, ANCHO - 2 * MARGEN - 40) : [];
  // La nota y la firma pueden bajar hasta casi el borde para no dejar una hoja solo con ellas.
  const pie = renglonesNota.length * 13 + (a.firma ? 14 : 0);
  const PISO = 34;
  if (l.y - 22 - pie >= PISO) l.y -= 22;
  else if (l.y - 10 - pie >= PISO) l.y -= 10;
  else {
    l.nuevaPagina();
    l.y -= 10;
  }
  for (const r of renglonesNota) {
    l.texto(r, ANCHO / 2, { tam: 10, alinear: "centro" });
    l.y -= 13;
  }
  if (a.firma) l.texto(a.firma, ANCHO / 2, { f: negrita, tam: 10.5, alinear: "centro" });

  /* ───── Números de página ───── */
  if (l.paginas.length > 1)
    l.paginas.forEach((p, i) => {
      const t = `Página ${i + 1} de ${l.paginas.length}`;
      p.drawText(t, { x: ANCHO / 2 - normal.widthOfTextAtSize(t, 8) / 2, y: 24, size: 8, font: normal, color: GRIS });
    });

  return doc.save();
}
