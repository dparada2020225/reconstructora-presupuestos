import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql, sum } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categoriaDeSeccion } from "../shared/categorias";
import { calcularDesdePresupuestos, type Estadisticas, type FilaPresupuesto } from "../shared/estadisticas";
import * as s from "./schema";

// Cualquier driver de Postgres (neon-http en el Worker, PGlite en tests).
type Db = PgDatabase<PgQueryResultHKT, any>;

const num = (x: unknown) => (x === null || x === undefined ? 0 : Number(x));
const numONull = (x: unknown) => (x === null || x === undefined ? null : Number(x));

/** Precio unitario de una línea: el escrito, o el total entre la cantidad. */
const unitario = sql<number>`coalesce(${s.presupuestoItems.precioUnitario}, ${s.presupuestoItems.precio} / nullif(${s.presupuestoItems.cantidad}, 0))`;

/**
 * Todo lo que muestra la página de Estadísticas, filtrado por años (inclusive).
 * Pocas consultas agregadas en Postgres; el resto se calcula en memoria.
 */
export async function obtenerEstadisticas(db: Db, filtro: { desde?: string | null; hasta?: string | null } = {}): Promise<Estadisticas> {
  const desde = filtro.desde && /^\d{4}$/.test(filtro.desde) ? filtro.desde : null;
  const hasta = filtro.hasta && /^\d{4}$/.test(filtro.hasta) ? filtro.hasta : null;
  const enRango = and(
    desde ? gte(s.presupuestos.fecha, `${desde}-01-01`) : undefined,
    hasta ? lte(s.presupuestos.fecha, `${hasta}-12-31`) : undefined,
  );

  const [aniosFilas, presupuestos, productos, precios, categorias, lineas] = await Promise.all([
    db
      .selectDistinct({ anio: sql<string>`to_char(${s.presupuestos.fecha}, 'YYYY')` })
      .from(s.presupuestos)
      .where(isNotNull(s.presupuestos.fecha)),
    db
      .select({
        id: s.presupuestos.id,
        trabajoId: s.presupuestos.trabajoId,
        clienteId: s.trabajos.clienteId,
        busId: s.trabajos.busId,
        fecha: s.presupuestos.fecha,
        tipo: s.presupuestos.tipo,
        total: s.presupuestos.total,
        cerradoEn: s.presupuestos.cerradoEn,
      })
      .from(s.presupuestos)
      .innerJoin(s.trabajos, eq(s.trabajos.id, s.presupuestos.trabajoId))
      .where(and(enRango, sql`${s.trabajos.estado} <> 'no_concretado'`)),
    db
      .select({
        id: s.productos.id,
        nombre: s.productos.nombre,
        categoria: s.productos.categoria,
        veces: count(),
        monto: sum(s.presupuestoItems.precio),
        medianaUnitario: sql<string | null>`percentile_cont(0.5) within group (order by ${unitario})`,
      })
      .from(s.presupuestoItems)
      .innerJoin(s.productos, eq(s.productos.id, s.presupuestoItems.productoId))
      .innerJoin(s.presupuestos, eq(s.presupuestos.id, s.presupuestoItems.presupuestoId))
      .where(and(enRango, isNull(s.presupuestoItems.parentId)))
      .groupBy(s.productos.id)
      .orderBy(desc(count()), asc(s.productos.nombre))
      .limit(60),
    db
      .select({
        productoId: s.presupuestoItems.productoId,
        anio: sql<string>`to_char(${s.presupuestos.fecha}, 'YYYY')`,
        mediana: sql<string>`percentile_cont(0.5) within group (order by ${unitario})`,
        n: count(),
      })
      .from(s.presupuestoItems)
      .innerJoin(s.presupuestos, eq(s.presupuestos.id, s.presupuestoItems.presupuestoId))
      .where(
        and(
          enRango,
          isNull(s.presupuestoItems.parentId),
          isNotNull(s.presupuestoItems.productoId),
          isNotNull(s.presupuestoItems.precio),
          isNotNull(s.presupuestos.fecha),
        ),
      )
      .groupBy(s.presupuestoItems.productoId, sql`to_char(${s.presupuestos.fecha}, 'YYYY')`),
    db
      .select({
        seccion: s.presupuestoItems.seccion,
        productoCategoria: s.productos.categoria,
        lineas: count(),
        monto: sum(s.presupuestoItems.precio),
      })
      .from(s.presupuestoItems)
      .innerJoin(s.presupuestos, eq(s.presupuestos.id, s.presupuestoItems.presupuestoId))
      .leftJoin(s.productos, eq(s.productos.id, s.presupuestoItems.productoId))
      .where(and(enRango, isNull(s.presupuestoItems.parentId)))
      .groupBy(s.presupuestoItems.seccion, s.productos.categoria),
    db
      .select({ n: count() })
      .from(s.presupuestoItems)
      .innerJoin(s.presupuestos, eq(s.presupuestos.id, s.presupuestoItems.presupuestoId))
      .where(and(enRango, isNull(s.presupuestoItems.parentId))),
  ]);

  const filas: FilaPresupuesto[] = presupuestos.map((p) => ({
    ...p,
    total: num(p.total),
    cerradoEn: numONull(p.cerradoEn),
  }));
  const base = calcularDesdePresupuestos(filas);

  // Clientes y buses de los trabajos en rango.
  const clienteIds = [...new Set(filas.map((f) => f.clienteId))];
  const busIds = [...new Set(filas.map((f) => f.busId).filter((x): x is number => x !== null))];
  const [clientes, buses] = await Promise.all([
    clienteIds.length
      ? db.select({ id: s.clientes.id, nombre: s.clientes.nombre }).from(s.clientes).where(inArray(s.clientes.id, clienteIds))
      : [],
    busIds.length
      ? db
          .select({ id: s.buses.id, nombre: s.buses.nombre, placa: s.buses.placa, clienteId: s.buses.clienteId })
          .from(s.buses)
          .where(inArray(s.buses.id, busIds))
      : [],
  ]);
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));

  const porCliente = new Map<number, { trabajos: Set<number>; presupuestos: number; buses: Set<number>; monto: number; ultima: string | null }>();
  for (const [trabajoId, ps] of base.porTrabajo) {
    const c = ps[0].clienteId;
    const r = porCliente.get(c) ?? { trabajos: new Set(), presupuestos: 0, buses: new Set(), monto: 0, ultima: null };
    r.trabajos.add(trabajoId);
    r.presupuestos += ps.length;
    if (ps[0].busId) r.buses.add(ps[0].busId);
    r.monto += base.montos.get(trabajoId)?.final ?? 0;
    const ult = ps.at(-1)?.fecha ?? null;
    if (ult && (!r.ultima || ult > r.ultima)) r.ultima = ult;
    porCliente.set(c, r);
  }

  const trabajosPorBus = new Map<number, number>();
  for (const ps of base.porTrabajo.values()) if (ps[0].busId) trabajosPorBus.set(ps[0].busId, (trabajosPorBus.get(ps[0].busId) ?? 0) + 1);

  return {
    anios: aniosFilas.map((a) => a.anio).filter(Boolean).sort(),
    filtro: { desde, hasta },
    resumen: {
      ...base.resumenParcial,
      buses: busIds.length,
      busesConPlaca: buses.filter((b) => b.placa).length,
      lineas: num(lineas[0]?.n),
    },
    porAnio: base.porAnio,
    porMes: base.porMes,
    clientes: [...porCliente.entries()]
      .map(([id, r]) => ({
        id,
        nombre: nombreCliente.get(id) ?? "—",
        trabajos: r.trabajos.size,
        presupuestos: r.presupuestos,
        buses: r.buses.size,
        monto: r.monto,
        ultima: r.ultima,
      }))
      .sort((a, b) => b.monto - a.monto),
    productos: productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      veces: num(p.veces),
      monto: num(p.monto),
      medianaUnitario: numONull(p.medianaUnitario),
    })),
    // Solo la evolución de los productos que se muestran (los más pedidos).
    precios: precios
      .filter((p) => p.productoId !== null && productos.some((x) => x.id === p.productoId))
      .map((p) => ({ productoId: p.productoId as number, anio: p.anio, mediana: num(p.mediana), n: num(p.n) }))
      .sort((a, b) => a.productoId - b.productoId || a.anio.localeCompare(b.anio)),
    categorias: agruparCategorias(categorias),
    buses: buses
      .map((b) => ({
        id: b.id,
        nombre: b.nombre,
        placa: b.placa,
        cliente: (b.clienteId && nombreCliente.get(b.clienteId)) || "—",
        trabajos: trabajosPorBus.get(b.id) ?? 0,
      }))
      .sort((a, b) => b.trabajos - a.trabajos || (a.nombre ?? "").localeCompare(b.nombre ?? "")),
  };
}

/**
 * Categoría de cada línea: primero por la sección del presupuesto (casi todas la
 * tienen); si la sección no dice nada, por la categoría del producto del catálogo.
 */
function agruparCategorias(filas: { seccion: string | null; productoCategoria: string | null; lineas: unknown; monto: unknown }[]) {
  const acc = new Map<string, { lineas: number; monto: number }>();
  for (const f of filas) {
    const cat =
      categoriaDeSeccion(f.seccion) ??
      f.productoCategoria ??
      (f.seccion && /extra/i.test(f.seccion) ? "EXTRAS (varios)" : f.seccion ? "OTRAS SECCIONES" : "Sin sección");
    const r = acc.get(cat) ?? { lineas: 0, monto: 0 };
    r.lineas += num(f.lineas);
    r.monto += num(f.monto);
    acc.set(cat, r);
  }
  return [...acc.entries()].map(([categoria, v]) => ({ categoria, ...v })).sort((a, b) => b.monto - a.monto);
}
