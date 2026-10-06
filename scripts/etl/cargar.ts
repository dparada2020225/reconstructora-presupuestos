import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "../../src/db/schema";
import { claveCliente } from "./normalizar";
import type { Historico, ItemFinal } from "./tipos";

type Db = PgDatabase<PgQueryResultHKT, typeof s>;

const money = (n: number | null | undefined) => (n === null || n === undefined ? null : n.toFixed(2));

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Carga el histórico a la base. Es idempotente: borra lo que tenga origen
 * "historico" y lo vuelve a crear. Lo creado en la app no se toca.
 */
export async function cargarHistorico(db: Db, h: Historico) {
  return db.transaction(async (tx) => {
    /* 1. Limpiar la carga anterior. */
    await tx.delete(s.trabajos).where(eq(s.trabajos.origen, "historico"));
    const busesUsados = tx.select({ id: s.trabajos.busId }).from(s.trabajos).where(sql`${s.trabajos.busId} is not null`);
    await tx
      .delete(s.buses)
      .where(and(eq(s.buses.origen, "historico"), notInArray(s.buses.id, busesUsados)));
    const clientesUsados = tx.select({ id: s.trabajos.clienteId }).from(s.trabajos);
    await tx
      .delete(s.clientes)
      .where(and(eq(s.clientes.origen, "historico"), notInArray(s.clientes.id, clientesUsados)));

    /* 2. Clientes (se reconocen por alias). */
    const idCliente = new Map<string, number>();
    for (const c of h.clientes) {
      const alias = [...new Set([claveCliente(c.nombre), ...c.alias])];
      const [existente] = await tx
        .select({ id: s.clienteAlias.clienteId })
        .from(s.clienteAlias)
        .where(inArray(s.clienteAlias.alias, alias))
        .limit(1);
      let id = existente?.id;
      if (!id) {
        [{ id }] = await tx.insert(s.clientes).values({ nombre: c.nombre, origen: "historico" }).returning({ id: s.clientes.id });
      }
      await tx
        .insert(s.clienteAlias)
        .values(alias.map((a) => ({ clienteId: id!, alias: a })))
        .onConflictDoNothing();
      idCliente.set(c.nombre, id);
    }

    /* 3. Productos: precio de referencia = mediana del precio unitario en el último año con datos. */
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
    for (const p of h.productos) {
      const precios = preciosPorProducto.get(p.nombre) ?? [];
      const ultimoAnio = precios.map((x) => x.anio).sort().at(-1);
      const ref = mediana(precios.filter((x) => x.anio === ultimoAnio).map((x) => x.precio));
      const [fila] = await tx
        .insert(s.productos)
        .values({ nombre: p.nombre, categoria: p.categoria, precioReferencia: money(ref) })
        .onConflictDoUpdate({
          target: s.productos.nombre,
          set: { categoria: sql`coalesce(${s.productos.categoria}, excluded.categoria)`, precioReferencia: money(ref) },
        })
        .returning({ id: s.productos.id });
      idProducto.set(p.nombre, fila.id);
      if (p.alias.length)
        await tx
          .insert(s.productoAlias)
          .values(p.alias.map((a) => ({ productoId: fila.id, alias: a })))
          .onConflictDoNothing();
    }

    /* 4. Buses. */
    const idBus = new Map<string, number>();
    const claveBus = (cliente: string, b: { placa: string | null; nombre: string | null }) =>
      b.placa ? `p:${b.placa}` : `n:${cliente}|${(b.nombre ?? "").toLowerCase()}`;
    for (const b of h.buses) {
      const clienteId = idCliente.get(b.cliente) ?? null;
      let id: number | undefined;
      if (b.placa) {
        const [e] = await tx.select({ id: s.buses.id }).from(s.buses).where(eq(s.buses.placa, b.placa)).limit(1);
        id = e?.id;
      }
      if (!id) {
        [{ id }] = await tx
          .insert(s.buses)
          .values({ clienteId, placa: b.placa, nombre: b.nombre, origen: "historico" })
          .returning({ id: s.buses.id });
      }
      idBus.set(claveBus(b.cliente, b), id);
    }

    /* 5. Trabajos, presupuestos e items. */
    let nPresupuestos = 0;
    let nItems = 0;
    for (const t of h.trabajos) {
      const clienteId = idCliente.get(t.cliente);
      if (!clienteId) throw new Error(`Cliente no encontrado: ${t.cliente}`);
      const busId = t.bus ? (idBus.get(claveBus(t.cliente, t.bus)) ?? null) : null;
      const [{ id: trabajoId }] = await tx
        .insert(s.trabajos)
        .values({
          clienteId,
          busId,
          titulo: t.presupuestos[0]?.titulo ?? null,
          estado: t.estado,
          fechaInicio: t.fechaInicio,
          fechaFin: t.fechaFin,
          precioCerrado: money(t.precioCerrado),
          origen: "historico",
        })
        .returning({ id: s.trabajos.id });

      for (const p of t.presupuestos) {
        const [{ id: presupuestoId }] = await tx
          .insert(s.presupuestos)
          .values({
            trabajoId,
            tipo: p.tipo,
            numero: p.numero,
            titulo: p.titulo,
            fecha: p.fecha,
            lugar: p.lugar,
            estado: "enviado",
            total: money(p.total),
            cerradoEn: money(p.cerradoEn),
            anticipo: money(p.anticipo),
            origenRef: p.origenRefs.join(" + "),
            origen: "historico",
          })
          .returning({ id: s.presupuestos.id });
        nPresupuestos++;

        const fila = (it: Omit<ItemFinal, "hijos">, orden: number, parentId: number | null) => ({
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
        if (!p.items.length) continue;
        const padres = await tx
          .insert(s.presupuestoItems)
          .values(p.items.map((it, i) => fila(it, i, null)))
          .returning({ id: s.presupuestoItems.id });
        nItems += padres.length;
        const hijos = p.items.flatMap((it, i) => it.hijos.map((hj, j) => fila(hj, j, padres[i].id)));
        if (hijos.length) {
          await tx.insert(s.presupuestoItems).values(hijos);
          nItems += hijos.length;
        }
      }
    }
    return {
      clientes: idCliente.size,
      productos: idProducto.size,
      buses: idBus.size,
      trabajos: h.trabajos.length,
      presupuestos: nPresupuestos,
      items: nItems,
    };
  });
}
