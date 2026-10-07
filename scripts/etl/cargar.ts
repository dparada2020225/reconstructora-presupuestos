import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "../../src/db/schema";
import { claveCliente } from "./normalizar";
import type { Historico, ItemFinal } from "./tipos";

type Db = PgDatabase<PgQueryResultHKT, typeof s>;
type Progreso = (msg: string) => void;

const money = (n: number | null | undefined) => (n === null || n === undefined ? null : n.toFixed(2));

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Parte un arreglo en bloques (Postgres admite ~65k parámetros por consulta). */
function bloques<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Carga el histórico a la base. Es idempotente: borra lo que tenga origen
 * "historico" y lo vuelve a crear. Lo creado en la app no se toca.
 *
 * Todo va en inserciones por bloque (unas 20 consultas en total) porque la base
 * está lejos y una consulta por fila tardaría minutos. Postgres devuelve las filas
 * de `INSERT … VALUES … RETURNING` en el mismo orden en que se mandaron.
 */
export async function cargarHistorico(db: Db, h: Historico, progreso: Progreso = () => {}) {
  return db.transaction(async (tx) => {
    /* 1. Limpiar la carga anterior. */
    progreso("Borrando la carga anterior…");
    await tx.delete(s.trabajos).where(eq(s.trabajos.origen, "historico"));
    const busesUsados = tx.select({ id: s.trabajos.busId }).from(s.trabajos).where(sql`${s.trabajos.busId} is not null`);
    await tx.delete(s.buses).where(and(eq(s.buses.origen, "historico"), notInArray(s.buses.id, busesUsados)));
    const clientesUsados = tx.select({ id: s.trabajos.clienteId }).from(s.trabajos);
    await tx
      .delete(s.clientes)
      .where(and(eq(s.clientes.origen, "historico"), notInArray(s.clientes.id, clientesUsados)));

    /* 2. Clientes (se reconocen por alias). */
    progreso(`Clientes (${h.clientes.length})…`);
    const aliasDe = new Map(h.clientes.map((c) => [c.nombre, [...new Set([claveCliente(c.nombre), ...c.alias])]]));
    const todosAlias = [...aliasDe.values()].flat();
    const existentes = todosAlias.length
      ? await tx
          .select({ alias: s.clienteAlias.alias, id: s.clienteAlias.clienteId })
          .from(s.clienteAlias)
          .where(inArray(s.clienteAlias.alias, todosAlias))
      : [];
    const idPorAlias = new Map(existentes.map((e) => [e.alias, e.id]));
    const idCliente = new Map<string, number>();
    const nuevos: string[] = [];
    for (const c of h.clientes) {
      const id = aliasDe.get(c.nombre)!.map((a) => idPorAlias.get(a)).find((x) => x !== undefined);
      if (id) idCliente.set(c.nombre, id);
      else nuevos.push(c.nombre);
    }
    if (nuevos.length) {
      const filas = await tx
        .insert(s.clientes)
        .values(nuevos.map((nombre) => ({ nombre, origen: "historico" as const })))
        .returning({ id: s.clientes.id });
      nuevos.forEach((n, i) => idCliente.set(n, filas[i].id));
    }
    const filasAlias = h.clientes.flatMap((c) => aliasDe.get(c.nombre)!.map((alias) => ({ clienteId: idCliente.get(c.nombre)!, alias })));
    if (filasAlias.length) await tx.insert(s.clienteAlias).values(filasAlias).onConflictDoNothing();

    /* 3. Productos: precio de referencia = mediana del precio unitario en el último año con datos. */
    progreso(`Productos (${h.productos.length})…`);
    const preciosPorProducto = new Map<string, { anio: string; precio: number }[]>();
    for (const t of h.trabajos)
      for (const p of t.presupuestos)
        for (const it of p.items) {
          if (!it.producto || !p.fecha) continue;
          const u = it.precioUnitario ?? (it.precio !== null ? it.precio / (it.cantidad || 1) : null);
          if (!u) continue;
          const arr = preciosPorProducto.get(it.producto) ?? [];
          arr.push({ anio: p.fecha.slice(0, 4), precio: u });
          preciosPorProducto.set(it.producto, arr);
        }
    const idProducto = new Map<string, number>();
    // Los que ya existen (por alias) se respetan tal cual: pudieron unirse o editarse en la app.
    const idPorAliasProd = new Map<string, number>();
    for (const grupo of bloques([...new Set(h.productos.flatMap((p) => p.alias))], 5000)) {
      const filas = await tx
        .select({ alias: s.productoAlias.alias, id: s.productoAlias.productoId })
        .from(s.productoAlias)
        .where(inArray(s.productoAlias.alias, grupo));
      for (const f of filas) idPorAliasProd.set(f.alias, f.id);
    }
    const productosNuevos = h.productos.filter((p) => {
      const id = p.alias.map((a) => idPorAliasProd.get(a)).find((x) => x !== undefined);
      if (id) idProducto.set(p.nombre, id);
      return !id;
    });
    for (const grupo of bloques(productosNuevos, 1000)) {
      const filas = await tx
        .insert(s.productos)
        .values(
          grupo.map((p) => {
            const precios = preciosPorProducto.get(p.nombre) ?? [];
            const ultimoAnio = precios.map((x) => x.anio).sort().at(-1);
            const ref = mediana(precios.filter((x) => x.anio === ultimoAnio).map((x) => x.precio));
            return { nombre: p.nombre, categoria: p.categoria, precioReferencia: money(ref) };
          }),
        )
        .onConflictDoUpdate({
          target: s.productos.nombre,
          set: {
            categoria: sql`coalesce(${s.productos.categoria}, excluded.categoria)`,
            precioReferencia: sql`excluded.precio_referencia`,
          },
        })
        .returning({ id: s.productos.id, nombre: s.productos.nombre });
      for (const f of filas) idProducto.set(f.nombre, f.id);
    }
    const filasAliasProd = h.productos.flatMap((p) => p.alias.map((alias) => ({ productoId: idProducto.get(p.nombre)!, alias })));
    for (const grupo of bloques(filasAliasProd, 5000)) await tx.insert(s.productoAlias).values(grupo).onConflictDoNothing();

    /* 4. Buses. */
    progreso(`Buses (${h.buses.length})…`);
    const claveBus = (cliente: string, b: { placa: string | null; nombre: string | null }) =>
      b.placa ? `p:${b.placa}` : `n:${cliente}|${(b.nombre ?? "").toLowerCase()}`;
    const idBus = new Map<string, number>();
    const placas = h.buses.map((b) => b.placa).filter((x): x is string => !!x);
    const conPlaca = placas.length
      ? await tx.select({ id: s.buses.id, placa: s.buses.placa }).from(s.buses).where(inArray(s.buses.placa, placas))
      : [];
    for (const b of conPlaca) idBus.set(`p:${b.placa}`, b.id);
    const busesNuevos = h.buses.filter((b) => !idBus.has(claveBus(b.cliente, b)));
    if (busesNuevos.length) {
      const filas = await tx
        .insert(s.buses)
        .values(
          busesNuevos.map((b) => ({
            clienteId: idCliente.get(b.cliente) ?? null,
            placa: b.placa,
            nombre: b.nombre,
            origen: "historico" as const,
          })),
        )
        .returning({ id: s.buses.id });
      busesNuevos.forEach((b, i) => idBus.set(claveBus(b.cliente, b), filas[i].id));
    }

    /* 5. Trabajos. */
    progreso(`Trabajos (${h.trabajos.length})…`);
    const idsTrabajo: number[] = [];
    for (const grupo of bloques(h.trabajos, 1000)) {
      const filas = await tx
        .insert(s.trabajos)
        .values(
          grupo.map((t) => {
            const clienteId = idCliente.get(t.cliente);
            if (!clienteId) throw new Error(`Cliente no encontrado: ${t.cliente}`);
            return {
              clienteId,
              busId: t.bus ? (idBus.get(claveBus(t.cliente, t.bus)) ?? null) : null,
              titulo: t.presupuestos[0]?.titulo ?? null,
              estado: t.estado,
              fechaInicio: t.fechaInicio,
              fechaFin: t.fechaFin,
              precioCerrado: money(t.precioCerrado),
              origen: "historico" as const,
            };
          }),
        )
        .returning({ id: s.trabajos.id });
      idsTrabajo.push(...filas.map((f) => f.id));
    }

    /* 6. Presupuestos. */
    const presupuestos = h.trabajos.flatMap((t, i) =>
      t.presupuestos.map((p) => ({ p, trabajoId: idsTrabajo[i], estado: t.estado === "no_concretado" ? ("cancelado" as const) : ("terminado" as const) })),
    );
    progreso(`Presupuestos (${presupuestos.length})…`);
    const idsPresupuesto: number[] = [];
    for (const grupo of bloques(presupuestos, 1000)) {
      const filas = await tx
        .insert(s.presupuestos)
        .values(
          grupo.map(({ p, trabajoId, estado }) => ({
            trabajoId,
            tipo: p.tipo,
            numero: p.numero,
            titulo: p.titulo,
            fecha: p.fecha,
            lugar: p.lugar,
            estado,
            total: money(p.total),
            cerradoEn: money(p.cerradoEn),
            anticipo: money(p.anticipo),
            origenRef: p.origenRefs.join(" + "),
            origen: "historico" as const,
          })),
        )
        .returning({ id: s.presupuestos.id });
      idsPresupuesto.push(...filas.map((f) => f.id));
    }

    /* 7. Items: primero los de arriba, después sus sub-items. */
    const fila = (it: Omit<ItemFinal, "hijos">, orden: number, presupuestoId: number, parentId: number | null) => ({
      presupuestoId,
      parentId,
      orden,
      seccion: it.seccion,
      descripcion: it.descripcion,
      cantidad: it.cantidad.toString(),
      precioUnitario: money(it.precioUnitario),
      precio: money(it.precio),
      precioPendiente: it.precioPendiente,
      productoId: it.producto ? (idProducto.get(it.producto) ?? null) : null,
    });
    const padres = presupuestos.flatMap(({ p }, i) => p.items.map((it, j) => ({ it, fila: fila(it, j, idsPresupuesto[i], null) })));
    progreso(`Líneas (${padres.length} + sub-items)…`);
    const idsPadre: number[] = [];
    for (const grupo of bloques(padres, 2000)) {
      const filas = await tx
        .insert(s.presupuestoItems)
        .values(grupo.map((g) => g.fila))
        .returning({ id: s.presupuestoItems.id });
      idsPadre.push(...filas.map((f) => f.id));
    }
    const hijos = padres.flatMap((g, i) => g.it.hijos.map((h2, j) => fila(h2, j, g.fila.presupuestoId, idsPadre[i])));
    for (const grupo of bloques(hijos, 2000)) await tx.insert(s.presupuestoItems).values(grupo);

    return {
      clientes: idCliente.size,
      productos: idProducto.size,
      buses: idBus.size,
      trabajos: h.trabajos.length,
      presupuestos: presupuestos.length,
      items: padres.length + hijos.length,
    };
  });
}
