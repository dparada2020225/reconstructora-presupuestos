import type { Historico, TrabajoFinal } from "./tipos";

/**
 * Estadísticas rápidas sobre el histórico (sin base de datos). La versión
 * interactiva vive en la app (fase 2); esto sirve para validar la migración.
 */

const q = (n: number) => `Q${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * cotizado: suma de todos los presupuestos del trabajo.
 * final: si algún documento trae "cerrado en", ese monto reemplaza a todo lo
 * cotizado hasta ese documento; lo que vino después se suma aparte.
 * cotizadoAlCierre: lo cotizado hasta el documento con "cerrado en" (para medir la rebaja).
 */
function montoTrabajo(t: TrabajoFinal) {
  const cotizado = t.presupuestos.reduce((s, p) => s + p.total, 0);
  const idx = t.presupuestos.map((p) => p.cerradoEn !== null).lastIndexOf(true);
  if (idx < 0) return { cotizado, final: cotizado, cotizadoAlCierre: null as number | null };
  const hasta = t.presupuestos.slice(0, idx + 1).reduce((s, p) => s + p.total, 0);
  const despues = t.presupuestos.slice(idx + 1).reduce((s, p) => s + p.total, 0);
  return { cotizado, final: (t.presupuestos[idx].cerradoEn ?? hasta) + despues, cotizadoAlCierre: hasta };
}

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function calcularEstadisticas(h: Historico) {
  const trabajos = h.trabajos;
  const presupuestos = trabajos.flatMap((t) => t.presupuestos.map((p) => ({ ...p, trabajo: t })));
  const items = presupuestos.flatMap((p) => p.items.map((i) => ({ ...i, p })));

  const totalCotizado = trabajos.reduce((s, t) => s + montoTrabajo(t).cotizado, 0);
  const totalFinal = trabajos.reduce((s, t) => s + montoTrabajo(t).final, 0);

  // Por año
  const porAnio = new Map<string, { trabajos: number; presupuestos: number; monto: number }>();
  for (const p of presupuestos) {
    const a = p.fecha?.slice(0, 4) ?? "s/f";
    const r = porAnio.get(a) ?? { trabajos: 0, presupuestos: 0, monto: 0 };
    r.presupuestos++;
    r.monto += p.total;
    if (p.tipo === "original") r.trabajos++;
    porAnio.set(a, r);
  }

  // Por mes del año (temporada)
  const porMes = new Array(12).fill(0) as number[];
  for (const p of presupuestos) if (p.fecha) porMes[Number(p.fecha.slice(5, 7)) - 1]++;

  // Clientes
  const porCliente = new Map<string, { trabajos: number; presupuestos: number; monto: number; buses: Set<string> }>();
  for (const t of trabajos) {
    const r = porCliente.get(t.cliente) ?? { trabajos: 0, presupuestos: 0, monto: 0, buses: new Set<string>() };
    r.trabajos++;
    r.presupuestos += t.presupuestos.length;
    r.monto += montoTrabajo(t).final;
    if (t.bus) r.buses.add(t.bus.placa ?? t.bus.nombre ?? "");
    porCliente.set(t.cliente, r);
  }
  const clientesRecurrentes = [...porCliente.values()].filter((c) => c.trabajos > 1).length;

  // Extras
  const conExtras = trabajos.filter((t) => t.presupuestos.some((p) => p.tipo === "extra"));
  const montoOriginal = conExtras.reduce((s, t) => s + t.presupuestos.filter((p) => p.tipo === "original").reduce((a, p) => a + p.total, 0), 0);
  const montoExtras = conExtras.reduce((s, t) => s + t.presupuestos.filter((p) => p.tipo === "extra").reduce((a, p) => a + p.total, 0), 0);

  // Cerrado vs cotizado
  const cerrados = trabajos.filter((t) => t.precioCerrado !== null);
  const rebajas = cerrados
    .map((t) => {
      const m = montoTrabajo(t);
      const idx = t.presupuestos.map((p) => p.cerradoEn !== null).lastIndexOf(true);
      const c = m.cotizadoAlCierre ?? 0;
      return c > 0 ? (c - (t.presupuestos[idx]?.cerradoEn ?? c)) / c : 0;
    })
    .filter((x) => Number.isFinite(x));

  // Productos
  const porProducto = new Map<string, { veces: number; monto: number; precios: { anio: string; precio: number }[] }>();
  for (const it of items) {
    if (!it.producto) continue;
    const r = porProducto.get(it.producto) ?? { veces: 0, monto: 0, precios: [] };
    r.veces++;
    r.monto += it.precio ?? 0;
    const unitario = it.precioUnitario ?? (it.precio !== null ? it.precio / (it.cantidad || 1) : null);
    if (unitario && it.p.fecha) r.precios.push({ anio: it.p.fecha.slice(0, 4), precio: unitario });
    porProducto.set(it.producto, r);
  }
  const topProductos = [...porProducto.entries()].sort((a, b) => b[1].veces - a[1].veces);
  const anios = [...porAnio.keys()].filter((a) => a !== "s/f").sort();

  // Secciones
  const porCategoria = new Map<string, { veces: number; monto: number }>();
  for (const it of items) {
    const cat = h.productos.find((p) => p.nombre === it.producto)?.categoria ?? "SIN CATEGORÍA";
    const r = porCategoria.get(cat) ?? { veces: 0, monto: 0 };
    r.veces++;
    r.monto += it.precio ?? 0;
    porCategoria.set(cat, r);
  }

  const montosTrabajo = trabajos.map((t) => montoTrabajo(t).final).filter((x) => x > 0);

  return {
    resumen: {
      clientes: porCliente.size,
      clientesRecurrentes,
      busesIdentificados: h.buses.length,
      busesConPlaca: h.buses.filter((b) => b.placa).length,
      trabajosSinBus: trabajos.filter((t) => !t.bus).length,
      trabajos: trabajos.length,
      presupuestos: presupuestos.length,
      items: items.length,
      totalCotizado,
      totalFinal,
      ticketPromedio: montosTrabajo.length ? totalFinal / montosTrabajo.length : 0,
      ticketMediana: mediana(montosTrabajo),
      trabajosConExtras: conExtras.length,
      montoOriginalConExtras: montoOriginal,
      montoExtras,
      trabajosCerrados: cerrados.length,
      rebajaPromedio: rebajas.length ? rebajas.reduce((s, x) => s + x, 0) / rebajas.length : 0,
      primeraFecha: presupuestos.map((p) => p.fecha).filter(Boolean).sort()[0] ?? null,
      ultimaFecha: presupuestos.map((p) => p.fecha).filter(Boolean).sort().at(-1) ?? null,
    },
    porAnio: [...porAnio.entries()].sort(),
    porMes,
    topClientesMonto: [...porCliente.entries()].sort((a, b) => b[1].monto - a[1].monto),
    topClientesTrabajos: [...porCliente.entries()].sort((a, b) => b[1].trabajos - a[1].trabajos || b[1].monto - a[1].monto),
    topProductos,
    porCategoria: [...porCategoria.entries()].sort((a, b) => b[1].monto - a[1].monto),
    anios,
  };
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function estadisticasMarkdown(h: Historico): string {
  const e = calcularEstadisticas(h);
  const r = e.resumen;
  const L: string[] = [];
  L.push(`# Estadísticas del histórico de presupuestos`, "", `Generado: ${h.generado}`, "");
  L.push(`Periodo: ${r.primeraFecha} → ${r.ultimaFecha}`, "");
  L.push("## Resumen", "");
  L.push(`| Métrica | Valor |`, `|---|---|`);
  L.push(`| Clientes distintos | ${r.clientes} (${r.clientesRecurrentes} con más de un trabajo) |`);
  L.push(`| Buses identificados | ${r.busesIdentificados} (${r.busesConPlaca} con placa) |`);
  L.push(`| Trabajos sin bus identificado | ${r.trabajosSinBus} |`);
  L.push(`| Trabajos | ${r.trabajos} |`);
  L.push(`| Presupuestos (originales + extras) | ${r.presupuestos} |`);
  L.push(`| Líneas de trabajo cotizadas | ${r.items} |`);
  L.push(`| Suma de todo lo cotizado | ${q(r.totalCotizado)} |`);
  L.push(`| Suma usando "cerrado en" cuando existe | ${q(r.totalFinal)} |`);
  L.push(`| Ticket promedio por trabajo | ${q(r.ticketPromedio)} (mediana ${q(r.ticketMediana)}) |`);
  L.push(`| Trabajos con extras | ${r.trabajosConExtras} de ${r.trabajos} (${pct(r.trabajosConExtras / Math.max(1, r.trabajos))}) |`);
  L.push(`| En esos trabajos, los extras sumaron | ${q(r.montoExtras)} sobre ${q(r.montoOriginalConExtras)} originales (+${pct(r.montoExtras / Math.max(1, r.montoOriginalConExtras))}) |`);
  L.push(`| Trabajos con "cerrado en" | ${r.trabajosCerrados}, rebaja promedio ${pct(r.rebajaPromedio)} |`);
  L.push("");

  L.push("## Por año", "", "| Año | Trabajos nuevos | Presupuestos | Monto cotizado |", "|---|---|---|---|");
  for (const [a, v] of e.porAnio) L.push(`| ${a} | ${v.trabajos} | ${v.presupuestos} | ${q(v.monto)} |`);
  L.push("");

  L.push("## Temporada (presupuestos por mes)", "", "| " + MESES.join(" | ") + " |", "|" + MESES.map(() => "---").join("|") + "|");
  L.push("| " + e.porMes.join(" | ") + " |", "");

  L.push("## Clientes con más trabajos", "", "| Cliente | Trabajos | Presupuestos | Buses | Monto |", "|---|---|---|---|---|");
  for (const [c, v] of e.topClientesTrabajos.slice(0, 20)) L.push(`| ${c} | ${v.trabajos} | ${v.presupuestos} | ${v.buses.size} | ${q(v.monto)} |`);
  L.push("");

  L.push("## Clientes por monto", "", "| Cliente | Monto | Trabajos |", "|---|---|---|");
  for (const [c, v] of e.topClientesMonto.slice(0, 20)) L.push(`| ${c} | ${q(v.monto)} | ${v.trabajos} |`);
  L.push("");

  L.push("## Lo que más se pide", "", "| Producto / trabajo | Veces | Monto total | Precio unitario mediano |", "|---|---|---|---|");
  for (const [p, v] of e.topProductos.slice(0, 40))
    L.push(`| ${p} | ${v.veces} | ${q(v.monto)} | ${q(mediana(v.precios.map((x) => x.precio)))} |`);
  L.push("");

  L.push("## Precio unitario mediano por año (top 15)", "");
  L.push("| Producto | " + e.anios.join(" | ") + " |", "|---|" + e.anios.map(() => "---").join("|") + "|");
  for (const [p, v] of e.topProductos.slice(0, 15)) {
    const celdas = e.anios.map((a) => {
      const xs = v.precios.filter((x) => x.anio === a).map((x) => x.precio);
      return xs.length ? `${q(mediana(xs))} (${xs.length})` : "—";
    });
    L.push(`| ${p} | ${celdas.join(" | ")} |`);
  }
  L.push("");

  L.push("## Por categoría", "", "| Categoría | Líneas | Monto |", "|---|---|---|");
  for (const [c, v] of e.porCategoria) L.push(`| ${c} | ${v.veces} | ${q(v.monto)} |`);
  L.push("");
  return L.join("\n");
}
