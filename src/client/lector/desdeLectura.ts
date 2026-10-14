/**
 * Lo que leyó la IA → estado del editor: secciones, cliente y bus reconocidos, y avisos de lo que
 * hay que revisar. Puro (sin React) para poder probarlo.
 */
import { claveCliente, claveNombreBus, normalizarPlaca } from "../../shared/claves";
import { revisarLectura, type AvisoLectura, type Lectura } from "../../shared/lector";
import { similitud } from "../../shared/texto";
import { nuevaKey, seccionVacia, type EditorEstado, type SeccionEd } from "../editor/modelo";

/** Parecido mínimo para escoger un cliente o bus aunque esté escrito un poco distinto. */
const PARECIDO = 0.85;

export function seccionesDesdeLectura(l: Lectura): SeccionEd[] {
  const out = l.secciones.map<SeccionEd>((s) => ({
    key: nuevaKey(),
    titulo: s.titulo ?? "",
    lineas: s.lineas.map((ln) => ({
      key: nuevaKey(),
      descripcion: ln.descripcion,
      // Si el precio escrito es el total del renglón ("4 sillas…… Q2,000") va con cantidad 1 y la
      // descripción tal cual: así el total queda exacto y el PDF no repite la cantidad.
      cantidad: ln.cadaUno ? String(ln.cantidad) : "1",
      precioUnitario: ln.precio === null ? "" : String(ln.precio),
      precioPendiente: ln.precioPendiente,
      productoId: null,
      detalles: ln.detalles.map((texto) => ({ key: nuevaKey(), texto })),
    })),
  }));
  return out.length ? out : [seccionVacia()];
}

interface ConNombre {
  id: number;
  nombre: string;
  alias?: string[];
}

/** Cliente de la lista que corresponde al nombre escrito: igual (sin tildes ni "Transportes") o muy parecido. */
export function emparejarCliente(escrito: string | null, clientes: ConNombre[]): { id: number; nombre: string; exacto: boolean } | null {
  if (!escrito) return null;
  const clave = claveCliente(escrito);
  if (!clave) return null;
  let mejor: { id: number; nombre: string; parecido: number } | null = null;
  for (const c of clientes) {
    for (const n of [c.nombre, ...(c.alias ?? [])]) {
      const otra = claveCliente(n);
      if (otra === clave) return { id: c.id, nombre: c.nombre, exacto: true };
      const p = similitud(clave, otra);
      if (p >= PARECIDO && (!mejor || p > mejor.parecido)) mejor = { id: c.id, nombre: c.nombre, parecido: p };
    }
  }
  return mejor && { id: mejor.id, nombre: mejor.nombre, exacto: false };
}

interface BusLista {
  id: number;
  nombre: string | null;
  placa: string | null;
  clienteId: number | null;
}

/** Bus del cliente por placa o por nombre. */
export function emparejarBus(l: Pick<Lectura, "bus" | "placa">, buses: BusLista[], clienteId: number | null): BusLista | null {
  if (!clienteId) return null;
  const delCliente = buses.filter((b) => b.clienteId === clienteId);
  const placas = [l.placa, l.bus].filter((x): x is string => !!x).map(normalizarPlaca);
  const porPlaca = delCliente.find((b) => b.placa && placas.includes(normalizarPlaca(b.placa)));
  if (porPlaca) return porPlaca;
  if (!l.bus) return null;
  const clave = claveNombreBus(l.bus);
  return delCliente.find((b) => b.nombre && (claveNombreBus(b.nombre) === clave || similitud(claveNombreBus(b.nombre), clave) >= PARECIDO)) ?? null;
}

/** Nombres del catálogo más usados, para ayudarle a la IA a entender la letra. */
export function vocabularioDe(productos: { nombre: string; activo: boolean; veces: number }[], max = 200): string[] {
  return productos
    .filter((p) => p.activo)
    .sort((a, b) => b.veces - a.veces)
    .slice(0, max)
    .map((p) => p.nombre);
}

export interface ResultadoLectura {
  inicial: EditorEstado;
  avisos: AvisoLectura[];
  /** Para precargar "Cliente nuevo" si no se encontró. */
  clienteEscrito: string | null;
}

/** Junta lo que ya se sabía (trabajo, cliente de la URL, lugar por defecto) con lo que se leyó. */
export function estadoDesdeLectura(
  base: EditorEstado,
  l: Lectura,
  /** origen: de dónde salió, para las notas internas ("fotos con Cloudflare · Gemma 4", "texto de Claude"). */
  o: { origen: string; esExtra: boolean; clientes: ConNombre[]; buses: BusLista[] },
): ResultadoLectura {
  const avisos = revisarLectura(l);
  let clienteId = base.clienteId;
  let busId = base.busId;
  if (!o.esExtra && !clienteId && l.cliente) {
    const c = emparejarCliente(l.cliente, o.clientes);
    if (c) {
      clienteId = c.id;
      if (!c.exacto) avisos.unshift({ tipo: "cliente", texto: `Se escogió el cliente "${c.nombre}" (en la hoja dice "${l.cliente}"). Revisa que sea él.` });
    } else avisos.unshift({ tipo: "cliente", texto: `El cliente "${l.cliente}" no está en la lista: búscalo con otro nombre o créalo con el botón +.` });
  }
  if (!o.esExtra && !busId && (l.bus || l.placa)) {
    const b = emparejarBus(l, o.buses, clienteId);
    if (b) busId = b.id;
    else avisos.push({ tipo: "cliente", texto: `Bus escrito: "${[l.placa, l.bus].filter(Boolean).join(" / ")}". Escógelo o créalo con el botón +.` });
  }
  return {
    inicial: {
      ...base,
      clienteId,
      busId,
      fecha: l.fecha ?? base.fecha,
      lugar: l.lugar ?? base.lugar,
      cerradoEn: l.cerradoEn === null ? base.cerradoEn : String(l.cerradoEn),
      anticipo: l.anticipo === null ? base.anticipo : String(l.anticipo),
      notas: [base.notas, `Pasado de ${o.origen}.`].filter(Boolean).join("\n"),
      secciones: l.secciones.length ? seccionesDesdeLectura(l) : base.secciones,
    },
    avisos,
    clienteEscrito: l.cliente,
  };
}
