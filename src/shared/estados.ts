/** Estados de presupuestos y trabajos, y cómo se calcula el del trabajo. */

export const ESTADOS_PRESUPUESTO = ["borrador", "cotizacion", "en_curso", "terminado", "cancelado"] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];
export type EstadoTrabajo = "cotizado" | "en_curso" | "terminado" | "no_concretado";

export const FORMAS_PAGO = ["efectivo", "cheque", "transferencia"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

/** Los que cuentan en estadísticas y en el total del trabajo. */
export const cuentaEnTotales = (e: EstadoPresupuesto) => e !== "cancelado";
export const cuentaEnEstadisticas = (e: EstadoPresupuesto) => e !== "borrador" && e !== "cancelado";

/**
 * Estado del trabajo según sus presupuestos (original + extras):
 * - todos cancelados → no_concretado
 * - los borradores no cuentan (salvo que solo haya borradores → cotizado)
 * - alguno en curso, o uno terminado y otro todavía pendiente → en_curso
 * - todos los vigentes terminados → terminado
 * - si no → cotizado
 */
export function estadoDelTrabajo(estados: EstadoPresupuesto[]): EstadoTrabajo {
  const vigentes = estados.filter((e) => e !== "cancelado");
  if (!vigentes.length) return estados.length ? "no_concretado" : "cotizado";
  // Un extra que todavía se está armando (borrador) no cambia en qué va el trabajo.
  const activos = vigentes.filter((e) => e !== "borrador");
  if (!activos.length) return "cotizado";
  if (activos.includes("en_curso")) return "en_curso";
  if (activos.every((e) => e === "terminado")) return "terminado";
  if (activos.includes("terminado")) return "en_curso";
  return "cotizado";
}

/** Porcentaje abonado (0–1) de un monto. */
export const porcentajeAbonado = (abonado: number, monto: number) => (monto > 0 ? Math.min(1, Math.max(0, abonado / monto)) : abonado > 0 ? 1 : 0);
