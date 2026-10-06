/** Tipos y cálculos puros de la página de Estadísticas (los usa el Worker y los tests). */

export interface FilaPresupuesto {
  id: number;
  trabajoId: number;
  clienteId: number;
  busId: number | null;
  fecha: string | null;
  tipo: "original" | "extra";
  total: number;
  cerradoEn: number | null;
}

export interface Resumen {
  clientes: number;
  clientesRecurrentes: number;
  buses: number;
  busesConPlaca: number;
  trabajos: number;
  trabajosSinBus: number;
  presupuestos: number;
  lineas: number;
  totalCotizado: number;
  totalFinal: number;
  ticketPromedio: number;
  ticketMediana: number;
  trabajosConExtras: number;
  montoOriginalConExtras: number;
  montoExtras: number;
  trabajosCerrados: number;
  rebajaPromedio: number;
  primeraFecha: string | null;
  ultimaFecha: string | null;
}

export interface Estadisticas {
  /** Años con datos (sin filtrar), para el selector. */
  anios: string[];
  filtro: { desde: string | null; hasta: string | null };
  resumen: Resumen;
  porAnio: { anio: string; trabajos: number; presupuestos: number; monto: number }[];
  /** Presupuestos por mes del año (ene..dic). */
  porMes: number[];
  clientes: { id: number; nombre: string; trabajos: number; presupuestos: number; buses: number; monto: number; ultima: string | null }[];
  productos: { id: number; nombre: string; categoria: string | null; veces: number; monto: number; medianaUnitario: number | null }[];
  precios: { productoId: number; anio: string; mediana: number; n: number }[];
  categorias: { categoria: string; lineas: number; monto: number }[];
  buses: { id: number; nombre: string | null; placa: string | null; cliente: string; trabajos: number }[];
}

export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Monto de un trabajo. Si algún documento trae "cerrado en", ese monto reemplaza lo
 * cotizado hasta ese documento; lo que vino después (extras) se suma aparte.
 */
export function montoTrabajo(ps: Pick<FilaPresupuesto, "total" | "cerradoEn">[]) {
  const cotizado = ps.reduce((s, p) => s + p.total, 0);
  const idx = ps.map((p) => p.cerradoEn !== null).lastIndexOf(true);
  if (idx < 0) return { cotizado, final: cotizado, rebaja: null as number | null };
  const hasta = ps.slice(0, idx + 1).reduce((s, p) => s + p.total, 0);
  const despues = ps.slice(idx + 1).reduce((s, p) => s + p.total, 0);
  const cerrado = ps[idx].cerradoEn ?? hasta;
  return { cotizado, final: cerrado + despues, rebaja: hasta > 0 ? (hasta - cerrado) / hasta : null };
}

/** Resumen y series por tiempo a partir de las filas de presupuestos. */
export function calcularDesdePresupuestos(filas: FilaPresupuesto[]) {
  const ordenadas = [...filas].sort(
    (a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || Number(a.tipo === "extra") - Number(b.tipo === "extra") || a.id - b.id,
  );
  const porTrabajo = new Map<number, FilaPresupuesto[]>();
  for (const f of ordenadas) porTrabajo.set(f.trabajoId, [...(porTrabajo.get(f.trabajoId) ?? []), f]);

  const montos = new Map<number, ReturnType<typeof montoTrabajo>>();
  for (const [id, ps] of porTrabajo) montos.set(id, montoTrabajo(ps));

  const finales = [...montos.values()].map((m) => m.final).filter((x) => x > 0);
  const conExtras = [...porTrabajo.values()].filter((ps) => ps.some((p) => p.tipo === "extra"));
  const rebajas = [...montos.values()].map((m) => m.rebaja).filter((x): x is number => x !== null);

  const porAnio = new Map<string, { trabajos: number; presupuestos: number; monto: number }>();
  const porMes = new Array<number>(12).fill(0);
  for (const f of ordenadas) {
    const anio = f.fecha?.slice(0, 4) ?? "s/f";
    const r = porAnio.get(anio) ?? { trabajos: 0, presupuestos: 0, monto: 0 };
    r.presupuestos++;
    r.monto += f.total;
    if (f.tipo === "original") r.trabajos++;
    porAnio.set(anio, r);
    if (f.fecha) porMes[Number(f.fecha.slice(5, 7)) - 1]++;
  }

  const trabajosPorCliente = new Map<number, Set<number>>();
  for (const f of ordenadas) trabajosPorCliente.set(f.clienteId, (trabajosPorCliente.get(f.clienteId) ?? new Set()).add(f.trabajoId));

  const fechas = ordenadas.map((f) => f.fecha).filter((x): x is string => !!x);
  return {
    porTrabajo,
    montos,
    resumenParcial: {
      clientes: trabajosPorCliente.size,
      clientesRecurrentes: [...trabajosPorCliente.values()].filter((s) => s.size > 1).length,
      trabajos: porTrabajo.size,
      trabajosSinBus: [...porTrabajo.values()].filter((ps) => ps[0].busId === null).length,
      presupuestos: ordenadas.length,
      totalCotizado: [...montos.values()].reduce((s, m) => s + m.cotizado, 0),
      totalFinal: [...montos.values()].reduce((s, m) => s + m.final, 0),
      ticketPromedio: finales.length ? finales.reduce((s, x) => s + x, 0) / finales.length : 0,
      ticketMediana: mediana(finales),
      trabajosConExtras: conExtras.length,
      montoOriginalConExtras: conExtras.reduce((s, ps) => s + ps.filter((p) => p.tipo === "original").reduce((a, p) => a + p.total, 0), 0),
      montoExtras: conExtras.reduce((s, ps) => s + ps.filter((p) => p.tipo === "extra").reduce((a, p) => a + p.total, 0), 0),
      trabajosCerrados: rebajas.length,
      rebajaPromedio: rebajas.length ? rebajas.reduce((s, x) => s + x, 0) / rebajas.length : 0,
      primeraFecha: fechas[0] ?? null,
      ultimaFecha: fechas.at(-1) ?? null,
    },
    porAnio: [...porAnio.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([anio, v]) => ({ anio, ...v })),
    porMes,
  };
}
