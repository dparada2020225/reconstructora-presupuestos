/**
 * Búsqueda global (Ctrl+K): presupuestos, clientes, buses y productos.
 * Corre en el navegador sobre las mismas listas que ya usan sus páginas (mismo caché),
 * sin tildes ni mayúsculas, y todas las palabras tienen que aparecer.
 */
import { nombreDocumento } from "../shared/presupuesto";
import { normalizar } from "../shared/texto";
import type { BusFila, ClienteFila, PresupuestoFila, ProductoFila } from "./api";

export type TipoResultado = "presupuesto" | "cliente" | "bus" | "producto";

export interface Resultado {
  tipo: TipoResultado;
  id: number;
  titulo: string;
  detalle: string;
  ruta: string;
}

export interface DatosBusqueda {
  presupuestos?: PresupuestoFila[];
  clientes?: ClienteFila[];
  buses?: BusFila[];
  productos?: ProductoFila[];
}

export const LIMITES: Record<TipoResultado, number> = { presupuesto: 8, cliente: 5, bus: 5, producto: 5 };

const ESTADO: Record<PresupuestoFila["estado"], string> = {
  borrador: "Borrador",
  cotizacion: "Cotización",
  en_curso: "En curso",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

/**
 * 0 = no coincide. Más alto = mejor: el nombre principal empieza con lo buscado (3),
 * alguna palabra empieza con lo buscado (2), solo aparece en medio (1).
 */
export function puntaje(busqueda: string, principal: string | null | undefined, ...otros: (string | null | undefined)[]) {
  const palabras = normalizar(busqueda).split(" ").filter(Boolean);
  if (!palabras.length) return 0;
  const p = normalizar(principal ?? "");
  const pajar = normalizar([principal, ...otros].filter(Boolean).join(" "));
  if (!palabras.every((x) => pajar.includes(x))) return 0;
  const q = palabras.join(" ");
  if (p.startsWith(q)) return 3;
  if (palabras.every((x) => ` ${pajar}`.includes(` ${x}`))) return 2;
  return 1;
}

/** Ordena por puntaje (y luego por el desempate) y corta al límite. */
function mejores<T>(xs: T[], puntuar: (x: T) => number, desempate: (a: T, b: T) => number, limite: number) {
  return xs
    .map((x) => ({ x, n: puntuar(x) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || desempate(a.x, b.x))
    .slice(0, limite)
    .map((r) => r.x);
}

const fechaDesc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

export function buscarTodo(datos: DatosBusqueda, texto: string): Resultado[] {
  const q = texto.trim();
  if (!q) return [];
  // "#123" o "123" solo: el presupuesto con ese número va primero.
  const numero = /^#?(\d+)$/.exec(q)?.[1];
  const porId = numero ? (datos.presupuestos ?? []).filter((p) => p.id === Number(numero)) : [];

  const presupuestos = mejores(
    (datos.presupuestos ?? []).filter((p) => !porId.includes(p)),
    (p) => puntaje(q, p.cliente, p.bus, p.placa, p.titulo, nombreDocumento(p)),
    (a, b) => fechaDesc(a.fecha, b.fecha) || b.id - a.id,
    LIMITES.presupuesto - porId.length,
  );
  const clientes = mejores(datos.clientes ?? [], (c) => puntaje(q, c.nombre, c.telefono, ...c.alias), (a, b) => b.trabajos - a.trabajos, LIMITES.cliente);
  const buses = mejores(datos.buses ?? [], (b) => puntaje(q, b.placa ?? b.nombre, b.nombre, b.cliente, b.descripcion), (a, b) => b.trabajos - a.trabajos, LIMITES.bus);
  const productos = mejores(
    (datos.productos ?? []).filter((p) => p.activo),
    (p) => puntaje(q, p.nombre, p.categoria, ...p.alias),
    (a, b) => b.veces - a.veces,
    LIMITES.producto,
  );

  return [
    ...[...porId, ...presupuestos].map<Resultado>((p) => ({
      tipo: "presupuesto",
      id: p.id,
      titulo: `${p.cliente}${p.tipo === "extra" ? ` · ${nombreDocumento(p)}` : ""}`,
      detalle: [[p.placa, p.bus].filter(Boolean).join(" / "), p.fecha, ESTADO[p.estado], `#${p.id}`].filter(Boolean).join(" · "),
      ruta: `/presupuestos/${p.id}`,
    })),
    ...clientes.map<Resultado>((c) => ({
      tipo: "cliente",
      id: c.id,
      titulo: c.nombre,
      detalle: [c.telefono, `${c.trabajos} ${c.trabajos === 1 ? "trabajo" : "trabajos"}`].filter(Boolean).join(" · "),
      ruta: `/clientes/${c.id}`,
    })),
    ...buses.map<Resultado>((b) => ({
      tipo: "bus",
      id: b.id,
      titulo: [b.placa, b.nombre].filter(Boolean).join(" / ") || `Bus #${b.id}`,
      detalle: [b.cliente, `${b.trabajos} ${b.trabajos === 1 ? "trabajo" : "trabajos"}`].filter(Boolean).join(" · "),
      ruta: `/buses/${b.id}`,
    })),
    ...productos.map<Resultado>((p) => ({
      tipo: "producto",
      id: p.id,
      titulo: p.nombre,
      detalle: [p.categoria, `usado ${p.veces} ${p.veces === 1 ? "vez" : "veces"}`].filter(Boolean).join(" · "),
      ruta: `/productos/${p.id}`,
    })),
  ];
}
