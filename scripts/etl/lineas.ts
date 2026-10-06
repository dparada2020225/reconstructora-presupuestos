import { montoEnTexto, parseQuetzales } from "../../src/shared/dinero";
import { limpiarDescripcion, normalizar } from "../../src/shared/texto";
import type { DocCrudo, ItemCrudo } from "./tipos";

/** Textos del encabezado/pie que no son items. */
const RUIDO = [
  /lugar y fecha/i,
  /^\s*cliente/i,
  /no\.?\s*(de\s*)?placa/i,
  /^\s*nota\s*:/i,
  /nelson/i,
  /gerente/i,
  /reconstructora antigua/i,
  /^\s*tels?\.?\s*:/i,
  /e-?mail/i,
  /patente/i,
  /@/,
  /^[\s_\-.…]+$/,
];

export function esRuido(t: string): boolean {
  return RUIDO.some((r) => r.test(t));
}

const SECCIONES_RESUMEN = /^(resumen|resumiendo|totales)\b/i;
const SECCION_ANTICIPOS = /^anticipos?\b/i;
const SECCION_EXTRA = /extra/i;

/** Mayúsculas "de título": letras en mayúscula, corto, sin precio. */
function pareceSeccion(t: string): boolean {
  const limpio = limpiarDescripcion(t);
  if (!limpio || limpio.length > 45) return false;
  const letras = limpio.replace(/[^\p{L}]/gu, "");
  if (letras.length < 3) return false;
  if (letras === letras.toUpperCase()) return true;
  // "ESTRELLA (INTERNATIONAL)  Placa C-000XXX": encabezado de otro bus dentro del documento.
  const mayus = letras.replace(/[^\p{Lu}]/gu, "").length;
  return /placa/i.test(limpio) && mayus / letras.length > 0.6;
}

/** "11 toma corriente Q.110 c/u" → {cantidad: 11, unitario: 110, desc: "toma corriente"}. */
export function separarCantidad(desc: string, precio: number | null) {
  let descripcion = desc;
  let cantidad = 1;
  let precioUnitario: number | null = null;

  const unit = descripcion.match(/\(?\s*Q\s*[.:,]?\s*\d[\d,.]*\s*(?:[.,]?-)?\s*(?:c\s*\/\s*u)?\s*\)?/i);
  const m = descripcion.match(/^(\d{1,3})\s+(?=\p{L})/u);
  if (m) {
    const n = Number(m[1]);
    // "1 toma" o "10 luces": cantidad. Evita años o medidas raras.
    if (n > 0 && n <= 500) cantidad = n;
  }
  if (unit) {
    const u = montoEnTexto(unit[0].replace(/[()]/g, ""));
    if (u !== null && cantidad > 1) precioUnitario = u;
    descripcion = descripcion.replace(unit[0], " ").replace(/\s+/g, " ").trim();
  }
  if (precioUnitario === null && precio !== null && cantidad > 1) {
    precioUnitario = Math.round((precio / cantidad) * 100) / 100;
  }
  descripcion = descripcion.replace(/\s+(c\s*\/\s*u)\b/i, "").trim();
  return { descripcion, cantidad, precioUnitario };
}

/**
 * Acumula filas (colA, colB, precio) en un documento. Comparte la lógica entre
 * el archivo nuevo (precio en D) y el viejo (precio en J o E, o dentro del texto).
 */
export class LectorItems {
  private seccion: string | null = null;
  private enResumen = false;
  private enAnticipos = false;
  private ultimoPadre: ItemCrudo | null = null;
  /** Suma de items desde la última línea TOTAL. */
  private acumulado = 0;
  private sinPrecioDesdeTotal = 0;
  private totalesSeccion: number[] = [];
  /** Item con precio escrito como título ("LUCES LAS NORMALES ... 7000"): lo que sigue sin precio es su detalle. */
  private padreConDetalle: ItemCrudo | null = null;

  /** Compara cada TOTAL escrito contra lo que suman los items de arriba. */
  private validarTotal(fila: number, v: number) {
    const cerca = (x: number, y: number) => Math.abs(x - y) <= 1;
    const sumaHijos = this.ultimoPadre?.hijos.reduce((s, h) => s + (h.precio ?? 0), 0) ?? 0;
    const sumaSecciones = this.totalesSeccion.reduce((s, x) => s + x, 0);
    this.doc.totalesEscritos.push(v);
    if (this.acumulado > 0 && cerca(this.acumulado, v)) {
      this.totalesSeccion.push(v);
    } else if (sumaHijos > 0 && cerca(sumaHijos, v)) {
      return; // subtotal del desglose de un item; no corta la sección
    } else if (this.totalesSeccion.length > 0 && cerca(sumaSecciones + this.acumulado, v)) {
      if (this.acumulado > 0) this.totalesSeccion.push(this.acumulado);
      this.totalesSeccion = [];
    } else if (this.acumulado === 0 && this.sinPrecioDesdeTotal > 0) {
      // Items sin precio y un solo total: el monto va "sin desglose".
      this.doc.totalSinDesglose += v;
      this.totalesSeccion.push(v);
      this.doc.avisos.push(`Fila ${fila}: total Q${v} sin precio por item (se cuenta como monto sin desglose)`);
    } else if (this.acumulado === 0) {
      // Líneas de resumen ("TOTAL ADENTRO", "TOTAL FINAL", totales de otras pestañas):
      // no traen items nuevos, no hay nada que validar.
      this.doc.resumenes++;
    } else {
      this.doc.avisos.push(
        `Fila ${fila}: TOTAL escrito Q${v} ≠ suma de items Q${this.acumulado} (dif ${v - this.acumulado})`,
      );
      this.totalesSeccion.push(v);
    }
    this.acumulado = 0;
    this.sinPrecioDesdeTotal = 0;
    this.padreConDetalle = null;
  }

  constructor(private doc: DocCrudo) {}

  fila(fila: number, colA: string | null, colB: string | null, precioCrudo: string | number | null) {
    const a = colA?.trim() ?? "";
    const b = colB?.trim() ?? "";
    if (!b && !a) return;
    if (!b) return; // números o guiones sueltos en A
    if (esRuido(b) || (a.length > 2 && esRuido(a))) return;

    const precio = parseQuetzales(precioCrudo);
    const pendiente = typeof precioCrudo === "string" && precioCrudo.trim() === "?";
    const bNorm = normalizar(b);

    // ANTICIPO / SALDO / TOTAL / CERRADO EN
    if (/^anticipos?\b/.test(bNorm) && precio) {
      this.doc.anticipo = precio;
      return;
    }
    if (/^saldo\b/.test(bNorm)) return;
    if (/^total\b/.test(bNorm)) {
      const v = precio ?? montoEnTexto(b);
      if (this.enAnticipos) {
        this.enAnticipos = false;
        return;
      }
      if (this.enResumen) {
        if (/anticipo/.test(bNorm) && v) this.doc.anticipo = v;
        if (/final/.test(bNorm) && v) this.doc.totalesEscritos.push(v);
        return;
      }
      if (v !== null && v > 0) this.validarTotal(fila, v);
      return;
    }
    if (/^cerrado\b/.test(bNorm)) {
      if (precio) this.doc.cerradoEn = precio;
      return;
    }

    // Sub-item: "*" en A o al inicio de B, o "a. b. c."
    // Si trae su propio precio en la columna de precios, cuenta como item normal
    // (así lo suma el Excel); si no, es detalle del item de arriba.
    const esHijo = (a === "*" || /^[*•]/.test(b) || /^[a-z][.)]\s/i.test(b)) && precio === null;
    if (esHijo && this.ultimoPadre && !this.enResumen) {
      const sinViñeta = b.replace(/^[a-z][.)]\s+/i, "");
      const precioHijo = precio ?? montoEnTexto(sinViñeta);
      const desc = limpiarDescripcion(sinViñeta.replace(/Q\s*[.:,]?\s*\d[\d,.]*\s*[.,]?-?\s*$/i, ""));
      if (!desc) return;
      const s = separarCantidad(desc, precioHijo);
      this.ultimoPadre.hijos.push({
        seccion: this.seccion,
        descripcion: s.descripcion,
        cantidad: s.cantidad,
        precioUnitario: s.precioUnitario,
        precio: precioHijo,
        precioPendiente: false,
        enSeccionExtra: SECCION_EXTRA.test(this.seccion ?? ""),
        hijos: [],
        fila,
      });
      return;
    }

    // Encabezado de sección
    const marcadoComoItem = a === "-" || /^\d+[.\-]?$/.test(a) || /^-/.test(b);
    if (precio === null && !pendiente && !marcadoComoItem && pareceSeccion(b)) {
      this.seccion = limpiarDescripcion(b);
      this.enResumen = SECCIONES_RESUMEN.test(this.seccion);
      this.enAnticipos = SECCION_ANTICIPOS.test(this.seccion);
      if (/placa/i.test(this.seccion)) this.doc.avisos.push(`Fila ${fila}: la sección "${this.seccion}" menciona otra placa (¿varios buses en un documento?)`);
      this.ultimoPadre = null;
      this.padreConDetalle = null;
      return;
    }
    if (this.enAnticipos) {
      if (precio) this.doc.anticipo = (this.doc.anticipo ?? 0) + precio;
      return;
    }
    if (this.enResumen) {
      if (/anticipo/.test(bNorm) && precio) this.doc.anticipo = precio;
      return;
    }

    const desc = limpiarDescripcion(b.replace(/^-+\s*/, ""));
    if (!desc) return;
    if (this.padreConDetalle && precio === null && !pendiente) {
      const s = separarCantidad(desc, null);
      this.padreConDetalle.hijos.push({
        seccion: this.seccion,
        descripcion: s.descripcion,
        cantidad: s.cantidad,
        precioUnitario: null,
        precio: null,
        precioPendiente: false,
        enSeccionExtra: SECCION_EXTRA.test(this.seccion ?? ""),
        hijos: [],
        fila,
      });
      return;
    }
    const s = separarCantidad(desc, precio && precio > 0 ? precio : null);
    const item: ItemCrudo = {
      seccion: this.seccion,
      descripcion: s.descripcion,
      cantidad: s.cantidad,
      precioUnitario: s.precioUnitario,
      precio: precio && precio > 0 ? precio : null,
      precioPendiente: pendiente,
      enSeccionExtra: SECCION_EXTRA.test(this.seccion ?? ""),
      hijos: [],
      fila,
    };
    this.doc.items.push(item);
    this.ultimoPadre = item;
    if (item.precio) this.acumulado += item.precio;
    else this.sinPrecioDesdeTotal++;
    this.padreConDetalle = item.precio && pareceSeccion(b) ? item : null;
  }
}

/** Palabras en el nombre de la pestaña/cliente que indican que es un extra. */
export function nombreIndicaExtra(t: string | null): boolean {
  if (!t) return false;
  return /\b(extras?|otras|accesorios|arreglo|lo ultimo hablado)\b/.test(normalizar(t));
}
