import { diasEntre } from "../../src/shared/fechas";
import { titulo } from "../../src/shared/texto";
import {
  agruparProductos,
  categoriaDeSeccion,
  claveCliente,
  claveNombreBus,
  claveProducto,
  detectarBus,
  limpiarNombreCliente,
  separarClienteTransporte,
  sugerirFusiones,
  type BusDetectado,
  type SugerenciaFusion,
} from "./normalizar";
import type {
  DocCrudo,
  Historico,
  ItemCrudo,
  ItemFinal,
  Overrides,
  PresupuestoFinal,
  TrabajoFinal,
} from "./tipos";

/** Días máximos para tomar como "extra" un presupuesto no marcado del mismo cliente. */
const VENTANA_EXTRA_INFERIDO = 31;

export interface Decision {
  tipo: "version-duplicada" | "unidas-mismo-dia" | "extra-inferido" | "extra-sin-original" | "seccion-extra-separada";
  detalle: string;
}

export interface ResultadoAgrupacion {
  historico: Historico;
  decisiones: Decision[];
  sugerenciasClientes: SugerenciaFusion[];
  variantesClientes: Map<string, Set<string>>;
  docs: DocCrudo[];
}

interface DocPreparado {
  doc: DocCrudo;
  orden: number;
  clienteClave: string;
  clienteNombre: string;
  bus: BusDetectado | null;
  busClave: string | null;
  extra: boolean;
  total: number;
}

function totalDoc(d: DocCrudo): number {
  return d.items.reduce((s, i) => s + (i.precio ?? 0), 0) + d.totalSinDesglose;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function busClave(clienteClave: string, bus: BusDetectado | null): string | null {
  if (!bus) return null;
  if (bus.placa) return `placa:${bus.placa.replace(/-/g, "")}`;
  if (bus.nombre) return `${clienteClave}|${claveNombreBus(bus.nombre)}`;
  if (bus.descripcion) return `${clienteClave}|desc:${claveNombreBus(bus.descripcion)}`;
  return null;
}

export function agrupar(docsEntrada: DocCrudo[], ov: Overrides): ResultadoAgrupacion {
  const decisiones: Decision[] = [];
  const ignorar = new Set(ov.ignorar ?? []);
  const aliasClientes = new Map(Object.entries(ov.clientes ?? {}).map(([k, v]) => [k, claveCliente(v)]));
  const variantes = new Map<string, Set<string>>();
  const nombrePorClave = new Map<string, Map<string, number>>();

  /* 1. Preparar cada documento: cliente, bus, si es extra. */
  const docs: DocPreparado[] = [];
  docsEntrada.forEach((doc, orden) => {
    if (ignorar.has(doc.ref)) return;
    const textoCliente = ov.clientePorDoc?.[doc.ref] ?? doc.clienteTexto ?? "(sin cliente)";
    const sep = separarClienteTransporte(textoCliente);
    let clave = claveCliente(sep.cliente);
    clave = aliasClientes.get(clave) ?? clave;
    const nombre = titulo(limpiarNombreCliente(ov.clientes?.[claveCliente(sep.cliente)] ?? sep.cliente));

    if (!variantes.has(clave)) variantes.set(clave, new Set());
    variantes.get(clave)!.add(textoCliente.trim());
    const conteo = nombrePorClave.get(clave) ?? new Map<string, number>();
    conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
    nombrePorClave.set(clave, conteo);

    let transporte = doc.transporteTexto ?? sep.transporte;
    const ovBus = transporte ? ov.buses?.[claveNombreBus(transporte)] : undefined;
    if (ovBus !== undefined) transporte = ovBus || null;
    const bus = detectarBus(transporte);

    docs.push({
      doc,
      orden,
      clienteClave: clave,
      clienteNombre: nombre,
      bus,
      busClave: busClave(clave, bus),
      extra: ov.tipoPorDoc?.[doc.ref]
        ? ov.tipoPorDoc[doc.ref] === "extra"
        : doc.marcadoComoExtra || (doc.items.length > 0 && doc.items.every((i) => i.enSeccionExtra)),
      total: totalDoc(doc),
    });
  });

  const nombreCliente = (clave: string) =>
    [...(nombrePorClave.get(clave) ?? new Map()).entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ??
    clave;

  /* 2. Versiones duplicadas: mismo cliente y fecha con items casi iguales → se queda la última. */
  const descartados = new Set<DocPreparado>();
  const claveItems = (d: DocPreparado) => new Set(d.doc.items.map((i) => claveProducto(i.descripcion)));
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i];
      const b = docs[j];
      if (descartados.has(a) || descartados.has(b)) continue;
      if (a.clienteClave !== b.clienteClave || !a.doc.fecha || a.doc.fecha !== b.doc.fecha) continue;
      if (a.extra !== b.extra) continue;
      const parecido = jaccard(claveItems(a), claveItems(b));
      if (parecido >= 0.5) {
        descartados.add(a);
        decisiones.push({
          tipo: "version-duplicada",
          detalle: `${a.doc.ref} (Q${a.total}) parece otra versión de ${b.doc.ref} (Q${b.total}) — ${Math.round(parecido * 100)}% de items iguales. Se usa la segunda.`,
        });
      }
    }
  }
  const vigentes = docs.filter((d) => !descartados.has(d));

  /* 3. Unir documentos del mismo cliente, mismo día y mismo tipo (pestañas "2, 3, 4…"). */
  vigentes.sort(
    (a, b) =>
      a.clienteClave.localeCompare(b.clienteClave) ||
      (a.doc.fecha ?? "9999").localeCompare(b.doc.fecha ?? "9999") ||
      Number(a.extra) - Number(b.extra) ||
      a.orden - b.orden,
  );
  const unidades: DocPreparado[][] = [];
  for (const d of vigentes) {
    const ult = unidades.at(-1);
    const prev = ult?.[0];
    if (
      prev &&
      prev.clienteClave === d.clienteClave &&
      prev.doc.fecha &&
      prev.doc.fecha === d.doc.fecha &&
      prev.extra === d.extra &&
      (!prev.busClave || !d.busClave || prev.busClave === d.busClave)
    ) {
      ult.push(d);
    } else {
      unidades.push([d]);
    }
  }
  for (const u of unidades)
    if (u.length > 1)
      decisiones.push({
        tipo: "unidas-mismo-dia",
        detalle: `Mismo cliente y fecha (${u[0].doc.fecha}), se unieron en un solo presupuesto: ${u.map((d) => d.doc.ref).join(" + ")}`,
      });

  /* 4. Armar trabajos por cliente. */
  const trabajos: (TrabajoFinal & { _busClave: string | null; _clienteClave: string })[] = [];
  const porClaveExplicita = new Map<string, (typeof trabajos)[number]>();

  for (const unidad of unidades) {
    const base = unidad[0];
    const fecha = base.doc.fecha;
    const busU = unidad.find((d) => d.bus)?.bus ?? null;
    const busClaveU = unidad.find((d) => d.busClave)?.busClave ?? null;
    const claveExplicita = unidad.map((d) => ov.trabajoPorDoc?.[d.doc.ref]).find(Boolean);

    let trabajo: (typeof trabajos)[number] | undefined;
    let esExtra = base.extra;

    if (claveExplicita) {
      trabajo = porClaveExplicita.get(claveExplicita);
      esExtra = !!trabajo && (ov.tipoPorDoc?.[base.doc.ref] ?? "extra") === "extra";
    } else {
      const delCliente = trabajos
        .filter((t) => t._clienteClave === base.clienteClave)
        .sort((a, b) => (b.fechaInicio ?? "").localeCompare(a.fechaInicio ?? ""));
      // Para inferir un extra sin que lo diga, el bus también tiene que coincidir.
      const ultimo = base.extra
        ? delCliente[0]
        : delCliente.find((t) => !t._busClave || !busClaveU || t._busClave === busClaveU);
      const ultimaFecha = ultimo?.presupuestos.at(-1)?.fecha ?? ultimo?.fechaInicio ?? null;
      const dias = ultimaFecha && fecha ? diasEntre(ultimaFecha, fecha) : null;

      if (base.extra) {
        if (ultimo) trabajo = ultimo;
        else {
          esExtra = false;
          decisiones.push({
            tipo: "extra-sin-original",
            detalle: `${base.doc.ref} dice EXTRA pero no hay un trabajo anterior del cliente; quedó como trabajo propio.`,
          });
        }
      } else if (ultimo && dias !== null && dias >= 0 && dias <= VENTANA_EXTRA_INFERIDO) {
        trabajo = ultimo;
        esExtra = true;
        decisiones.push({
          tipo: "extra-inferido",
          detalle: `${unidad.map((d) => d.doc.ref).join(" + ")} se tomó como EXTRA del trabajo de ${ultimo.fechaInicio} (${dias} días después, mismo cliente).`,
        });
      }
    }

    if (!trabajo) {
      trabajo = {
        clave: claveExplicita ?? `${base.clienteClave}#${fecha ?? base.orden}`,
        cliente: base.clienteClave,
        bus: busU ? { placa: busU.placa, nombre: busU.nombre ?? busU.descripcion } : null,
        estado: "terminado",
        fechaInicio: fecha,
        fechaFin: null,
        precioCerrado: null,
        presupuestos: [],
        _busClave: busClaveU,
        _clienteClave: base.clienteClave,
      };
      trabajos.push(trabajo);
      if (claveExplicita) porClaveExplicita.set(claveExplicita, trabajo);
      esExtra = false;
    } else if (!trabajo.bus && busU) {
      trabajo.bus = { placa: busU.placa, nombre: busU.nombre ?? busU.descripcion };
      trabajo._busClave = busClaveU;
    }

    // Items de la unidad; si es original, las secciones "EXTRAS" se separan como extra.
    const itemsOriginal: ItemCrudo[] = [];
    const itemsExtraSeccion: ItemCrudo[] = [];
    for (const d of unidad)
      for (const it of d.doc.items) (it.enSeccionExtra && !esExtra ? itemsExtraSeccion : itemsOriginal).push(it);

    const meta = {
      fecha,
      lugar: base.doc.lugar,
      origenRefs: unidad.map((d) => d.doc.ref),
      cerradoEn: unidad.map((d) => d.doc.cerradoEn).find((x) => x !== null) ?? null,
      anticipo: unidad.map((d) => d.doc.anticipo).find((x) => x !== null) ?? null,
      sinDesglose: unidad.reduce((s, d) => s + d.doc.totalSinDesglose, 0),
      totalEscrito: unidad.length === 1 && base.doc.totalesEscritos.length ? Math.max(...base.doc.totalesEscritos) : null,
      titulo: base.doc.pestana ?? limpiarNombreCliente(base.doc.clienteTexto ?? ""),
    };

    const agregar = (tipo: "original" | "extra", items: ItemCrudo[], sinDesglose: number, sufijo = "") => {
      const finales = items.map((it, i) => aItemFinal(it, i));
      const total = finales.reduce((s, i) => s + (i.precio ?? 0), 0) + sinDesglose;
      trabajo!.presupuestos.push({
        tipo,
        numero: 0,
        titulo: meta.titulo + sufijo,
        fecha: meta.fecha,
        lugar: meta.lugar,
        total,
        totalEscrito: sufijo ? null : meta.totalEscrito,
        cerradoEn: sufijo ? null : meta.cerradoEn,
        anticipo: sufijo ? null : meta.anticipo,
        origenRefs: meta.origenRefs,
        items: finales,
      });
    };

    if (!itemsOriginal.length && itemsExtraSeccion.length) {
      itemsOriginal.push(...itemsExtraSeccion);
      itemsExtraSeccion.length = 0;
    }
    agregar(esExtra ? "extra" : "original", itemsOriginal, meta.sinDesglose);
    if (itemsExtraSeccion.length) {
      agregar("extra", itemsExtraSeccion, 0, " (sección EXTRAS)");
      decisiones.push({
        tipo: "seccion-extra-separada",
        detalle: `${meta.origenRefs.join(" + ")}: ${itemsExtraSeccion.length} items de una sección EXTRAS se guardaron como presupuesto extra del mismo trabajo.`,
      });
    }
  }

  /* 5. Numerar, cerrar precios y estados. */
  const noConcretados = new Set(ov.noConcretados ?? []);
  for (const t of trabajos) {
    t.presupuestos.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || Number(a.tipo === "extra") - Number(b.tipo === "extra"));
    let n = 0;
    for (const p of t.presupuestos) p.numero = p.tipo === "original" ? 0 : ++n;
    // Si el primer documento quedó como extra (p. ej. por override), el más antiguo es el original.
    if (!t.presupuestos.some((p) => p.tipo === "original") && t.presupuestos[0]) {
      t.presupuestos[0].tipo = "original";
      t.presupuestos[0].numero = 0;
    }
    const cerrados = t.presupuestos.filter((p) => p.cerradoEn !== null);
    t.precioCerrado = cerrados.at(-1)?.cerradoEn ?? null;
    const refs = t.presupuestos.flatMap((p) => p.origenRefs);
    if (noConcretados.has(t.clave) || refs.some((r) => noConcretados.has(r))) t.estado = "no_concretado";
    t.cliente = nombreCliente(t._clienteClave);
  }

  /* 6. Catálogo de productos a partir de todos los items. */
  const frecuencias = new Map<string, number>();
  const ejemplos = new Map<string, Map<string, number>>();
  const secciones = new Map<string, Map<string, number>>();
  const recorrer = (fn: (it: ItemFinal | Omit<ItemFinal, "hijos">, p: PresupuestoFinal) => void) => {
    for (const t of trabajos) for (const p of t.presupuestos) for (const it of p.items) fn(it, p);
  };
  recorrer((it) => {
    const k = claveProducto(it.descripcion);
    if (!k) return;
    frecuencias.set(k, (frecuencias.get(k) ?? 0) + 1);
    const ej = ejemplos.get(k) ?? new Map<string, number>();
    ej.set(it.descripcion, (ej.get(it.descripcion) ?? 0) + 1);
    ejemplos.set(k, ej);
    const cat = categoriaDeSeccion(it.seccion);
    if (cat) {
      const sc = secciones.get(k) ?? new Map<string, number>();
      sc.set(cat, (sc.get(cat) ?? 0) + 1);
      secciones.set(k, sc);
    }
  });
  const ovProd = new Map(Object.entries(ov.productos ?? {}).map(([k, v]) => [claveProducto(k), v]));
  const grupos = agruparProductos(frecuencias);
  const porRep = new Map<string, { claves: string[]; veces: number }>();
  for (const [k, rep] of grupos) {
    const destino = ovProd.has(k) ? `ov:${ovProd.get(k)}` : rep;
    const g = porRep.get(destino) ?? { claves: [], veces: 0 };
    g.claves.push(k);
    g.veces += frecuencias.get(k) ?? 0;
    porRep.set(destino, g);
  }
  const productos: Historico["productos"] = [];
  const nombreProducto = new Map<string, string>();
  for (const [rep, g] of porRep) {
    if (g.veces < 2 && !rep.startsWith("ov:")) continue; // se queda como texto libre
    const conteoEj = new Map<string, number>();
    const conteoCat = new Map<string, number>();
    for (const k of g.claves) {
      for (const [e, n] of ejemplos.get(k) ?? []) conteoEj.set(e, (conteoEj.get(e) ?? 0) + n);
      for (const [c, n] of secciones.get(k) ?? []) conteoCat.set(c, (conteoCat.get(c) ?? 0) + n);
    }
    const masComun = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? null;
    let nombre = rep.startsWith("ov:") ? rep.slice(3) : (masComun(conteoEj) ?? rep);
    nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    // Nombres únicos
    let unico = nombre;
    for (let i = 2; productos.some((p) => p.nombre.toLowerCase() === unico.toLowerCase()); i++) unico = `${nombre} (${i})`;
    productos.push({ nombre: unico, categoria: masComun(conteoCat), alias: g.claves, veces: g.veces });
    for (const k of g.claves) nombreProducto.set(k, unico);
  }
  productos.sort((a, b) => b.veces - a.veces);
  recorrer((it) => {
    it.producto = nombreProducto.get(claveProducto(it.descripcion)) ?? null;
  });

  /* 7. Clientes y buses. */
  const clientes = [...new Set(trabajos.map((t) => t._clienteClave))].map((k) => ({
    nombre: nombreCliente(k),
    alias: [k],
  }));
  const busesMapa = new Map<string, Historico["buses"][number]>();
  for (const t of trabajos)
    if (t.bus && t._busClave && !busesMapa.has(t._busClave))
      busesMapa.set(t._busClave, { cliente: t.cliente, placa: t.bus.placa, nombre: t.bus.nombre });

  const sugerenciasClientes = sugerirFusiones([...new Set(trabajos.map((t) => t._clienteClave))].sort());
  // Mismo primer nombre y el nombre de uno menciona el bus del otro ("Pedro Estrella" / Pedro López → bus "Estrella").
  for (const a of trabajos)
    for (const b of trabajos) {
      if (a._clienteClave >= b._clienteClave || !b.bus?.nombre) continue;
      const pa = a._clienteClave.split(" ");
      const pb = b._clienteClave.split(" ");
      const busB = claveNombreBus(b.bus.nombre).split(" ");
      if (pa[0] === pb[0] && pa.slice(1).some((w) => w.length > 3 && busB.includes(w)))
        if (!sugerenciasClientes.some((s) => s.a === a._clienteClave && s.b === b._clienteClave))
          sugerenciasClientes.push({ a: a._clienteClave, b: b._clienteClave, similitud: 0, motivo: `"${b.cliente}" tiene un bus llamado "${b.bus.nombre}"` });
    }

  const limpios: TrabajoFinal[] = trabajos.map(({ _busClave, _clienteClave, ...t }) => t);
  return {
    historico: {
      generado: new Date().toISOString(),
      clientes,
      buses: [...busesMapa.values()],
      productos,
      trabajos: limpios,
    },
    decisiones,
    sugerenciasClientes,
    variantesClientes: variantes,
    docs: docsEntrada,
  };
}

function aItemFinal(it: ItemCrudo, orden: number): ItemFinal {
  return {
    orden,
    seccion: it.seccion,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
    precio: it.precio,
    precioPendiente: it.precioPendiente,
    producto: null,
    hijos: it.hijos.map((h, i) => ({
      orden: i,
      seccion: h.seccion,
      descripcion: h.descripcion,
      cantidad: h.cantidad,
      precioUnitario: h.precioUnitario,
      precio: h.precio,
      precioPendiente: h.precioPendiente,
      producto: null,
    })),
  };
}
