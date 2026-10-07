/**
 * Estado del editor de presupuestos y conversión desde/hacia lo que guarda la API.
 * Los números se editan como texto (para permitir "1,500" o dejarlos vacíos).
 */
import { precioLinea, redondear, type LineaEntrada, type PresupuestoEntrada } from "../../shared/presupuesto";
import type { ItemGuardado } from "../api";

let contador = 0;
export const nuevaKey = () => `k${++contador}`;

export interface DetalleEd {
  key: string;
  texto: string;
}

export interface LineaEd {
  key: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  precioPendiente: boolean;
  productoId: number | null;
  detalles: DetalleEd[];
}

export interface SeccionEd {
  key: string;
  titulo: string;
  lineas: LineaEd[];
}

export interface EditorEstado {
  clienteId: number | null;
  busId: number | null;
  titulo: string;
  fecha: string;
  lugar: string;
  cerradoEn: string;
  notas: string;
  notaPie: string;
  secciones: SeccionEd[];
}

export const lineaVacia = (): LineaEd => ({
  key: nuevaKey(),
  descripcion: "",
  cantidad: "1",
  precioUnitario: "",
  precioPendiente: false,
  productoId: null,
  detalles: [],
});

export const seccionVacia = (titulo = ""): SeccionEd => ({ key: nuevaKey(), titulo, lineas: [lineaVacia()] });

/** "1,500.50" → 1500.5; "" → null. */
export function aNumero(texto: string): number | null {
  const t = texto.replace(/[Qq,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const aTexto = (n: number | null) => (n === null ? "" : String(n));

export function lineaAEntrada(l: LineaEd, seccion: string): LineaEntrada {
  return {
    seccion: seccion.trim() || null,
    descripcion: l.descripcion.trim(),
    cantidad: aNumero(l.cantidad) ?? 1,
    precioUnitario: aNumero(l.precioUnitario),
    precioPendiente: l.precioPendiente,
    productoId: l.productoId,
    detalles: l.detalles.map((d) => d.texto.trim()).filter(Boolean),
  };
}

export const totalLinea = (l: LineaEd) => precioLinea(lineaAEntrada(l, ""));

export const totalSeccion = (s: SeccionEd) => redondear(s.lineas.reduce((a, l) => a + (totalLinea(l) ?? 0), 0));

export const totalEditor = (e: EditorEstado) => redondear(e.secciones.reduce((a, s) => a + totalSeccion(s), 0));

/** Una línea "vacía" (sin descripción ni precio) no se guarda. */
const lineaUsada = (l: LineaEd) => l.descripcion.trim() !== "" || aNumero(l.precioUnitario) !== null || l.detalles.some((d) => d.texto.trim());

export function aEntrada(e: EditorEstado, extra: { trabajoId?: number | null }): PresupuestoEntrada {
  return {
    trabajoId: extra.trabajoId ?? null,
    clienteId: e.clienteId ?? undefined,
    busId: e.busId,
    titulo: e.titulo.trim() || null,
    fecha: e.fecha,
    lugar: e.lugar.trim() || null,
    cerradoEn: aNumero(e.cerradoEn),
    notas: e.notas.trim() || null,
    notaPie: e.notaPie.trim() || null,
    lineas: e.secciones.flatMap((s) => s.lineas.filter(lineaUsada).map((l) => lineaAEntrada(l, s.titulo))),
  };
}

/** Líneas que tienen precio o descripción pero les falta lo otro (para avisar antes de guardar). */
export function lineasIncompletas(e: EditorEstado): number {
  return e.secciones.reduce((a, s) => a + s.lineas.filter((l) => lineaUsada(l) && !l.descripcion.trim()).length, 0);
}

/**
 * Items guardados → secciones del editor. Los sub-items sin precio son "detalles";
 * los que sí tienen precio (así venían algunos del Excel) pasan a ser líneas propias
 * para que el total no cambie al volver a guardar.
 */
export function desdeItems(items: ItemGuardado[]): SeccionEd[] {
  const padres = items.filter((i) => i.parentId === null).sort((a, b) => a.orden - b.orden || a.id - b.id);
  const hijosDe = new Map<number, ItemGuardado[]>();
  for (const i of items)
    if (i.parentId !== null) hijosDe.set(i.parentId, [...(hijosDe.get(i.parentId) ?? []), i].sort((a, b) => a.orden - b.orden || a.id - b.id));

  const aLinea = (i: ItemGuardado): LineaEd => ({
    key: nuevaKey(),
    descripcion: i.descripcion,
    cantidad: aTexto(i.cantidad || 1),
    precioUnitario: aTexto(i.precioUnitario ?? (i.precio !== null ? redondear(i.precio / (i.cantidad || 1)) : null)),
    precioPendiente: i.precioPendiente,
    productoId: i.productoId,
    detalles: [],
  });

  const secciones: SeccionEd[] = [];
  const agregar = (titulo: string, l: LineaEd) => {
    const ultima = secciones.at(-1);
    if (ultima && ultima.titulo === titulo) ultima.lineas.push(l);
    else secciones.push({ key: nuevaKey(), titulo, lineas: [l] });
  };
  for (const p of padres) {
    const linea = aLinea(p);
    const hijos = hijosDe.get(p.id) ?? [];
    linea.detalles = hijos.filter((h) => h.precio === null && !h.precioPendiente).map((h) => ({ key: nuevaKey(), texto: h.descripcion }));
    agregar(p.seccion ?? "", linea);
    for (const h of hijos.filter((h) => h.precio !== null || h.precioPendiente)) agregar(p.seccion ?? "", aLinea(h));
  }
  return secciones.length ? secciones : [seccionVacia()];
}

/** Copia secciones con keys nuevas (para "usar como base"). */
export const copiarSecciones = (ss: SeccionEd[]): SeccionEd[] =>
  ss.map((s) => ({
    ...s,
    key: nuevaKey(),
    lineas: s.lineas.map((l) => ({ ...l, key: nuevaKey(), detalles: l.detalles.map((d) => ({ ...d, key: nuevaKey() })) })),
  }));
