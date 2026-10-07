/**
 * Forma de un presupuesto al guardarlo desde el editor y cálculos que comparten
 * la API, el editor y el PDF.
 */

export interface LineaEntrada {
  /** Título de la sección ("ADENTRO", "AFUERA"…) o null si va suelta. */
  seccion: string | null;
  descripcion: string;
  cantidad: number;
  /** Precio por unidad; null si todavía no se sabe. */
  precioUnitario: number | null;
  /** Precio "?" (por definir): se imprime "?" y no suma. */
  precioPendiente: boolean;
  productoId: number | null;
  /** Renglones de detalle debajo (los "*" del Excel): solo texto, no suman. */
  detalles: string[];
}

export interface PresupuestoEntrada {
  /** Si viene, el presupuesto es un EXTRA de ese trabajo. */
  trabajoId?: number | null;
  /** Para un trabajo nuevo (o para cambiar el cliente/bus del trabajo). */
  clienteId?: number;
  busId?: number | null;
  titulo: string | null;
  fecha: string;
  lugar: string | null;
  cerradoEn: number | null;
  /** Anticipo anotado en este presupuesto (sale en el PDF). Los abonos del trabajo son aparte. */
  anticipo: number | null;
  notas: string | null;
  notaPie: string | null;
  lineas: LineaEntrada[];
}

export const redondear = (n: number) => Math.round(n * 100) / 100;

/** Total de una línea: cantidad × precio por unidad (null si no tiene precio o está en "?"). */
export function precioLinea(l: Pick<LineaEntrada, "cantidad" | "precioUnitario" | "precioPendiente">): number | null {
  if (l.precioPendiente || l.precioUnitario === null) return null;
  return redondear(l.cantidad * l.precioUnitario);
}

export function totalLineas(lineas: Pick<LineaEntrada, "cantidad" | "precioUnitario" | "precioPendiente">[]): number {
  return redondear(lineas.reduce((a, l) => a + (precioLinea(l) ?? 0), 0));
}

/** Agrupa líneas consecutivas por sección, en el orden en que aparecen. */
export function agruparSecciones<T extends { seccion: string | null }>(lineas: T[]): { titulo: string | null; lineas: T[] }[] {
  const out: { titulo: string | null; lineas: T[] }[] = [];
  for (const l of lineas) {
    const ultima = out.at(-1);
    if (ultima && ultima.titulo === l.seccion) ultima.lineas.push(l);
    else out.push({ titulo: l.seccion, lineas: [l] });
  }
  return out;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "Ciudad Vieja Sacatepéquez, lunes 28 de agosto de 2026." */
export function lugarYFecha(lugar: string | null, fechaIso: string | null): string {
  if (!fechaIso) return lugar ?? "";
  const [a, m, d] = fechaIso.slice(0, 10).split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  const fecha = `${dia} ${d} de ${MESES[m - 1]} de ${a}.`;
  return lugar ? `${lugar}, ${fecha}` : fecha.charAt(0).toUpperCase() + fecha.slice(1);
}

/** "Q4,500.00" como en el Excel. */
export const quetzales = (n: number) =>
  `Q${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Fecha de hoy en Guatemala (AAAA-MM-DD), sin depender de la zona del servidor. */
export function hoyGuatemala(ahora = new Date()): string {
  return new Date(ahora.getTime() - 6 * 3600_000).toISOString().slice(0, 10);
}

/** Nombre del documento: "Original", "Extra 1"… */
export const nombreDocumento = (p: { tipo: "original" | "extra"; numero: number }) =>
  p.tipo === "original" ? "Original" : `Extra${p.numero ? ` ${p.numero}` : ""}`;

/** Ajustes del membrete (tabla configuracion). */
export interface Ajustes {
  empresa: string;
  correo: string;
  telefono: string;
  firma: string;
  nota: string;
  lugar: string;
  /** data:image/png;base64,… o "" */
  logo: string;
  /** Íconos (una imagen) que van a la derecha del nombre de la empresa, p. ej. las redes sociales. */
  iconosEmpresa: string;
  /** Ícono que va a la derecha del teléfono, p. ej. WhatsApp. */
  iconosTelefono: string;
}

/** Ajustes que son imágenes (data URL PNG/JPG). */
export const IMAGENES_AJUSTES = ["logo", "iconosEmpresa", "iconosTelefono"] as const;

export const CLAVES_AJUSTES = ["empresa", "correo", "telefono", "firma", "nota", "lugar", ...IMAGENES_AJUSTES] as const;

export const AJUSTES_VACIOS: Ajustes = {
  empresa: "",
  correo: "",
  telefono: "",
  firma: "",
  nota: "NOTA: Los trabajos realizados que no se encuentren en esta hoja se tomarán como EXTRA.",
  lugar: "",
  logo: "",
  iconosEmpresa: "",
  iconosTelefono: "",
};

/** Una línea guardada tal como la usan el PDF y el respaldo en Sheets. */
export interface ItemImpreso {
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

/** Descripción como se imprime: con la cantidad adelante si no la trae y el precio por unidad. */
export function descripcionImpresa(i: ItemImpreso): string {
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
