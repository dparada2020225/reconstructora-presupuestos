/**
 * Presupuesto desde fotos: qué se le pide a la IA, cómo se lee lo que contesta y qué hay que
 * revisar. Lo usan el Worker (arma el pedido y valida la respuesta) y el navegador (avisos).
 */
import { parseQuetzales } from "./dinero";
import { redondear } from "./presupuesto";

/** Lectores disponibles. Se escoge en Ajustes (admin); se guarda en `configuracion.lector_proveedor`. */
export const PROVEEDORES_LECTOR = {
  "cloudflare-gemma": { nombre: "Cloudflare · Gemma 4", detalle: "Gratis (hasta ~100 hojas al día)", modelo: "@cf/google/gemma-4-26b-a4b-it" },
  "cloudflare-llama": { nombre: "Cloudflare · Llama 4 Scout", detalle: "Gratis (hasta ~40 hojas al día)", modelo: "@cf/meta/llama-4-scout-17b-16e-instruct" },
  claude: { nombre: "Claude Sonnet", detalle: "De pago (~Q0.25 por presupuesto de 2 hojas)", modelo: "claude-sonnet-5-5" },
} as const;

export type ProveedorLector = keyof typeof PROVEEDORES_LECTOR;
export const LISTA_PROVEEDORES = Object.keys(PROVEEDORES_LECTOR) as ProveedorLector[];
export const PROVEEDOR_POR_DEFECTO: ProveedorLector = "cloudflare-gemma";
export const esProveedor = (v: unknown): v is ProveedorLector => typeof v === "string" && v in PROVEEDORES_LECTOR;

export const MAX_FOTOS = 6;
/** Lecturas por día entre todos (para que un error o un abuso no gaste de más). */
export const LIMITE_DIARIO = 40;
/** Lado largo de la foto al achicarla en el navegador (más grande no lo aprovecha la IA). */
export const LADO_FOTO = 1600;

export interface LineaLeida {
  descripcion: string;
  /** Lo que dice la columna de precios (el total del renglón, o el precio por unidad si `cadaUno`). */
  precio: number | null;
  cadaUno: boolean;
  /** Piezas, solo importa si `cadaUno` ("4 sillas a Q500 c/u"). */
  cantidad: number;
  precioPendiente: boolean;
  detalles: string[];
}

export interface SeccionLeida {
  titulo: string | null;
  /** El TOTAL escrito a mano debajo de la sección (para comparar con la suma). */
  totalEscrito: number | null;
  lineas: LineaLeida[];
}

export interface Lectura {
  cliente: string | null;
  bus: string | null;
  placa: string | null;
  /** AAAA-MM-DD */
  fecha: string | null;
  lugar: string | null;
  secciones: SeccionLeida[];
  cerradoEn: number | null;
  anticipo: number | null;
  /** Lo que la IA dice que no entendió. */
  dudas: string[];
}

/** Lo que devuelve POST /api/lector. */
export interface RespuestaLector {
  lectura: Lectura;
  proveedor: ProveedorLector;
  usoHoy: number;
  limite: number;
}

/** Instrucciones para la IA. `vocabulario` = nombres del catálogo, para ayudarle a leer la letra. */
export function instrucciones(vocabulario: string[] = []): string {
  const palabras = vocabulario.length ? `\nNombres de trabajos que se usan seguido (te ayudan a entender la letra; no los agregues si no están escritos):\n${vocabulario.join("; ")}\n` : "";
  return `Pasas a computadora presupuestos escritos a mano de un taller que reconstruye buses en Guatemala.
Las fotos son las hojas de UN solo presupuesto, en orden.

Cómo vienen escritos:
- Arriba: lugar y fecha, "Cliente:", a veces la placa o el nombre del bus o del transporte.
- Secciones con un título en MAYÚSCULAS (ADENTRO, AFUERA, TROMPA, LEVANTADA, EXTRAS…).
- Debajo, renglones que empiezan con "-": una descripción y el precio a la derecha (Q4,500 / 4,500.- / 4500).
- Renglones con "*", "a.", "b."… sin precio son detalles del renglón de arriba.
- "TOTAL" al final de una sección es la suma escrita: no es un renglón, va en totalEscrito.
- "RESUMEN" o "TOTALES" repiten los totales de cada sección: NO los copies como renglones.
- "CERRADO EN" es el precio final negociado; "ANTICIPO" es el adelanto.

Reglas:
- Copia el texto como está escrito (solo corrige ortografía evidente). Si una palabra no se entiende, pon tu mejor lectura seguida de [?] y anótala en "dudas".
- precio: el número de la columna de precios de ese renglón, en quetzales, como número (4500). Sin precio: null. Si el precio es "?", precioPendiente = true.
- Si el renglón dice "c/u" o "cada uno": cadaUno = true, precio = precio de una pieza y cantidad = número de piezas. Si no, cadaUno = false y cantidad = 1.
- No inventes renglones ni precios, y no hagas cuentas para llenar huecos.
- fecha en formato AAAA-MM-DD. Lo que no esté escrito va como null.
${palabras}
Responde SOLO con el JSON, sin texto antes ni después, con esta forma:
{"cliente":"…","bus":null,"placa":null,"fecha":"2026-01-31","lugar":"…","secciones":[{"titulo":"ADENTRO","totalEscrito":20300,"lineas":[{"descripcion":"…","precio":4500,"cadaUno":false,"cantidad":1,"precioPendiente":false,"detalles":["…"]}]}],"cerradoEn":null,"anticipo":null,"dudas":["…"]}`;
}

/* ───────────────────────── Leer la respuesta ───────────────────────── */

/** Saca el JSON de lo que contestó la IA (a veces lo envuelve en ```json o le pone texto alrededor). */
export function extraerJson(texto: string): unknown {
  const sinCercas = texto.replace(/```(?:json)?/gi, "");
  const ini = sinCercas.indexOf("{");
  const fin = sinCercas.lastIndexOf("}");
  if (ini < 0 || fin <= ini) throw new Error("La respuesta no trae un presupuesto (no hay JSON)");
  try {
    return JSON.parse(sinCercas.slice(ini, fin + 1));
  } catch {
    throw new Error("La respuesta no se pudo leer (JSON incompleto o mal formado)");
  }
}

const textoONull = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim().slice(0, max);
  return t && !/^(null|n\/a|ninguno|-)$/i.test(t) ? t : null;
};
const monto = (v: unknown): number | null => {
  const n = parseQuetzales(typeof v === "string" ? v.replace(/^\s*Q\s*/i, "Q") : v);
  return n !== null && n >= 0 && n < 100_000_000 ? redondear(n) : null;
};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const fechaIso = (v: unknown): string | null => {
  const t = textoONull(v, 20);
  const m = t?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return a >= 2000 && a <= 2100 && me >= 1 && me <= 12 && d >= 1 && d <= 31 ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const RE_RESUMEN = /^(resumen|resumiendo|totales?)\b/i;

/** Valida y limpia la respuesta (la IA a veces manda números como texto, campos de más o de menos). */
export function normalizarLectura(crudo: unknown): Lectura {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const secciones: SeccionLeida[] = [];
  for (const sx of lista(o.secciones).slice(0, 40)) {
    const so = (sx && typeof sx === "object" ? sx : {}) as Record<string, unknown>;
    const titulo = textoONull(so.titulo, 80)?.toUpperCase() ?? null;
    // Un "RESUMEN" copiado como sección duplicaría el total.
    if (titulo && RE_RESUMEN.test(titulo)) continue;
    const lineas: LineaLeida[] = [];
    for (const lx of lista(so.lineas).slice(0, 200)) {
      const lo = (lx && typeof lx === "object" ? lx : { descripcion: lx }) as Record<string, unknown>;
      const descripcion = textoONull(lo.descripcion, 300)?.replace(/^[-–•*]\s*/, "") ?? "";
      const precio = monto(lo.precio);
      const pendiente = lo.precioPendiente === true || (typeof lo.precio === "string" && lo.precio.trim() === "?");
      if (!descripcion && precio === null) continue;
      if (RE_RESUMEN.test(descripcion) || /^total\b/i.test(descripcion)) continue;
      const cantidad = Number(lo.cantidad);
      const cadaUno = lo.cadaUno === true && Number.isFinite(cantidad) && cantidad > 1;
      lineas.push({
        descripcion,
        precio: pendiente ? null : precio,
        cadaUno,
        cantidad: cadaUno ? Math.min(cantidad, 10_000) : 1,
        precioPendiente: pendiente,
        detalles: lista(lo.detalles)
          .map((d) => textoONull(d, 300)?.replace(/^[-–•*]\s*|^[a-z][.)]\s+/i, "") ?? "")
          .filter(Boolean)
          .slice(0, 30),
      });
    }
    if (lineas.length) secciones.push({ titulo, totalEscrito: monto(so.totalEscrito), lineas });
  }
  return {
    cliente: textoONull(o.cliente, 120)?.replace(/^cliente\s*:\s*/i, "") ?? null,
    bus: textoONull(o.bus, 120),
    placa: textoONull(o.placa, 20),
    fecha: fechaIso(o.fecha),
    lugar: textoONull(o.lugar, 160),
    secciones,
    cerradoEn: monto(o.cerradoEn),
    anticipo: monto(o.anticipo),
    dudas: lista(o.dudas)
      .map((d) => textoONull(d, 200))
      .filter((d): d is string => !!d)
      .slice(0, 30),
  };
}

/* ───────────────────────── Revisión ───────────────────────── */

/** Total de un renglón leído (lo que va a sumar en el editor). */
export const totalLineaLeida = (l: LineaLeida) => (l.precioPendiente || l.precio === null ? 0 : redondear(l.cadaUno ? l.precio * l.cantidad : l.precio));

export const sumaSeccionLeida = (s: SeccionLeida) => redondear(s.lineas.reduce((a, l) => a + totalLineaLeida(l), 0));

export interface AvisoLectura {
  tipo: "suma" | "duda" | "sinPrecio" | "vacio" | "cliente";
  texto: string;
}

const q = (n: number) => `Q${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Qué hay que revisar a mano: sumas que no cuadran, palabras dudosas y renglones sin precio. */
export function revisarLectura(l: Lectura): AvisoLectura[] {
  const avisos: AvisoLectura[] = [];
  if (!l.secciones.length) avisos.push({ tipo: "vacio", texto: "No se encontró ningún renglón en las fotos." });
  for (const s of l.secciones) {
    const suma = sumaSeccionLeida(s);
    if (s.totalEscrito !== null && Math.abs(suma - s.totalEscrito) >= 0.01)
      avisos.push({ tipo: "suma", texto: `${s.titulo ?? "Sin sección"}: los renglones suman ${q(suma)} pero el TOTAL escrito es ${q(s.totalEscrito)}. Falta o sobra algún precio.` });
  }
  const conDuda = new Set<string>();
  for (const s of l.secciones)
    for (const ln of s.lineas) {
      for (const t of [ln.descripcion, ...ln.detalles]) if (t.includes("[?]")) conDuda.add(t);
      if (ln.precio === null && !ln.precioPendiente) avisos.push({ tipo: "sinPrecio", texto: `Sin precio: "${ln.descripcion}"` });
    }
  for (const t of conDuda) avisos.push({ tipo: "duda", texto: `Palabra dudosa: "${t}"` });
  for (const d of l.dudas) if (![...conDuda].some((t) => t.includes(d) || d.includes(t))) avisos.push({ tipo: "duda", texto: d });
  return avisos;
}
