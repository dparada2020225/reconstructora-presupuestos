/** Cliente mínimo para la API del Worker. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (cuerpo as { error?: string }).error ?? res.statusText);
  return cuerpo as T;
}

/** POST/PATCH/DELETE con cuerpo JSON. */
export const enviar = <T = { ok: true }>(metodo: "POST" | "PUT" | "PATCH" | "DELETE", ruta: string, cuerpo?: unknown) =>
  api<T>(ruta, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

export type Rol = "admin" | "usuario";
export type EstadoUsuario = "pendiente" | "activo" | "denegado";
export type Usuario = { id: number; email: string; nombre: string; rol: Rol };
export type UsuarioAdmin = Usuario & { estado: EstadoUsuario; creadoEn: string };

import type { EstadoPresupuesto, EstadoTrabajo, FormaPago } from "../shared/estados";
export type { EstadoPresupuesto, EstadoTrabajo, FormaPago };

export interface TrabajoResumen {
  id: number;
  titulo: string | null;
  estado: EstadoTrabajo;
  fecha: string | null;
  clienteId: number;
  cliente: string;
  busId: number | null;
  bus: string | null;
  placa: string | null;
  cotizado: number;
  monto: number;
  /** Suma de los abonos del trabajo. */
  abonado: number;
  presupuestos: {
    id: number;
    tipo: "original" | "extra";
    numero: number;
    titulo: string | null;
    fecha: string | null;
    estado: EstadoPresupuesto;
    total: number;
    cerradoEn: number | null;
  }[];
}

export interface ClienteFila {
  id: number;
  nombre: string;
  telefono: string | null;
  notas: string | null;
  buses: number;
  trabajos: number;
  ultima: string | null;
  alias: string[];
}

export interface ClienteDetalle {
  id: number;
  nombre: string;
  telefono: string | null;
  notas: string | null;
  origen: "app" | "historico";
  alias: string[];
  buses: { id: number; nombre: string | null; placa: string | null; descripcion: string | null; trabajos: number }[];
  trabajos: TrabajoResumen[];
}

export interface BusFila {
  id: number;
  nombre: string | null;
  placa: string | null;
  descripcion: string | null;
  notas: string | null;
  clienteId: number | null;
  cliente: string | null;
  trabajos: number;
  ultima: string | null;
}

export interface BusDetalle extends Omit<BusFila, "trabajos" | "ultima"> {
  origen: "app" | "historico";
  trabajos: TrabajoResumen[];
}

export interface ProductoFila {
  id: number;
  nombre: string;
  categoria: string | null;
  precioReferencia: number | null;
  unidad: string | null;
  activo: boolean;
  veces: number;
  ultimaFecha: string | null;
  ultimoPrecio: number | null;
  alias: string[];
}

export interface ProductoDetalle {
  id: number;
  nombre: string;
  categoria: string | null;
  precioReferencia: number | null;
  unidad: string | null;
  activo: boolean;
  notas: string | null;
  alias: string[];
  veces: number;
  usos: {
    id: number;
    presupuestoId: number;
    trabajoId: number;
    tipo: "original" | "extra";
    fecha: string | null;
    clienteId: number;
    cliente: string;
    descripcion: string;
    cantidad: number;
    unitario: number | null;
    precio: number | null;
  }[];
  porAnio: { anio: string; mediana: number; n: number }[];
}

export type Descartado = { aId: number; bId: number };

export interface Pago {
  id: number;
  fecha: string;
  monto: number;
  forma: FormaPago | null;
  nota: string | null;
  creadoPor: string | null;
}

export interface PresupuestoFila {
  id: number;
  trabajoId: number;
  tipo: "original" | "extra";
  numero: number;
  titulo: string | null;
  fecha: string | null;
  estado: EstadoPresupuesto;
  total: number;
  cerradoEn: number | null;
  origen: "app" | "historico";
  actualizadoEn: string;
  estadoTrabajo: EstadoTrabajo;
  clienteId: number;
  cliente: string;
  busId: number | null;
  bus: string | null;
  placa: string | null;
}

export interface ItemGuardado {
  id: number;
  parentId: number | null;
  orden: number;
  seccion: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number | null;
  precio: number | null;
  precioPendiente: boolean;
  productoId: number | null;
}

export interface Hermano {
  id: number;
  tipo: "original" | "extra";
  numero: number;
  fecha: string | null;
  estado: EstadoPresupuesto;
  total: number;
  cerradoEn: number | null;
  anticipo: number | null;
}

export interface PresupuestoDetalle {
  id: number;
  trabajoId: number;
  tipo: "original" | "extra";
  numero: number;
  titulo: string | null;
  fecha: string | null;
  lugar: string | null;
  estado: EstadoPresupuesto;
  total: number;
  cerradoEn: number | null;
  anticipo: number | null;
  notas: string | null;
  notaPie: string | null;
  origen: "app" | "historico";
  actualizadoEn: string;
  items: ItemGuardado[];
  trabajo: { id: number; estado: EstadoTrabajo; clienteId: number; cliente: string; busId: number | null; bus: string | null; placa: string | null };
  hermanos: Hermano[];
}

export interface TrabajoDetalle extends TrabajoResumen {
  /** Abonos de todo el trabajo (no salen en el PDF). */
  pagos: Pago[];
  notas: string | null;
  fechaFin: string | null;
  origen: "app" | "historico";
}
