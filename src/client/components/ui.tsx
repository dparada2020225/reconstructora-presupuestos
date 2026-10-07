import { useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";
import { normalizar } from "../../shared/texto";
import type { EstadoPresupuesto, EstadoTrabajo, FormaPago } from "../api";

/* ───────────── Formatos ───────────── */

export const formatoQ = (n: number) => `Q${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const ESTADO_TRABAJO: Record<EstadoTrabajo, { texto: string; clase: string }> = {
  cotizado: { texto: "Cotizado", clase: "bg-sky-100 text-sky-900" },
  en_curso: { texto: "En curso", clase: "bg-amber-100 text-amber-900" },
  terminado: { texto: "Terminado", clase: "bg-emerald-100 text-emerald-900" },
  no_concretado: { texto: "No se concretó", clase: "bg-slate-200 text-slate-700" },
};

export const ESTADO_PRESUPUESTO: Record<EstadoPresupuesto, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-slate-200 text-slate-700" },
  cotizacion: { texto: "Cotización", clase: "bg-sky-100 text-sky-900" },
  en_curso: { texto: "En curso", clase: "bg-amber-100 text-amber-900" },
  terminado: { texto: "Terminado", clase: "bg-emerald-100 text-emerald-900" },
  cancelado: { texto: "Cancelado", clase: "bg-red-100 text-red-800" },
};

export const FORMA_PAGO: Record<FormaPago, string> = { efectivo: "Efectivo", cheque: "Cheque", transferencia: "Transferencia" };

/** Aro con el porcentaje en el centro (p. ej. lo abonado de un presupuesto). */
export function Aro({ valor, tamano = 96, etiqueta }: { valor: number; tamano?: number; etiqueta: string }) {
  const r = 40;
  const largo = 2 * Math.PI * r;
  const pct = Math.round(valor * 100);
  return (
    <svg viewBox="0 0 100 100" width={tamano} height={tamano} role="img" aria-label={`${etiqueta}: ${pct}%`} className="shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      {valor > 0 && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={valor >= 1 ? "#059669" : "#2a78d6"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${largo * valor} ${largo}`}
          transform="rotate(-90 50 50)"
        />
      )}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="600" fill="#0f172a">
        {pct}%
      </text>
    </svg>
  );
}

/** Cada palabra buscada tiene que aparecer en alguno de los textos (sin tildes ni mayúsculas). */
export function coincide(busqueda: string, ...textos: (string | null | undefined)[]) {
  const palabras = normalizar(busqueda).split(" ").filter(Boolean);
  if (!palabras.length) return true;
  const pajar = normalizar(textos.filter(Boolean).join(" "));
  return palabras.every((p) => pajar.includes(p));
}

/* ───────────── Botones y campos ───────────── */

const VARIANTES = {
  primario: "bg-marca-700 text-white hover:bg-marca-600",
  secundario: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
  peligro: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  peligroLleno: "bg-red-700 text-white hover:bg-red-600",
  texto: "text-marca-700 hover:bg-marca-50",
};

export function Boton({
  variante = "secundario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof VARIANTES }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
    />
  );
}

export const claseInput =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-100 disabled:bg-slate-100";

export function Campo({ etiqueta, ayuda, children, className = "" }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-slate-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export function Aviso({ children, tono = "error" }: { children: ReactNode; tono?: "error" | "info" | "ok" }) {
  const clases = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-amber-200 bg-amber-50 text-amber-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tono];
  return (
    <p role={tono === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${clases}`}>
      {children}
    </p>
  );
}

export function Insignia({ children, clase = "bg-slate-100 text-slate-700" }: { children: ReactNode; clase?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${clase}`}>{children}</span>;
}

export function Caja({ titulo, accion, children, className = "" }: { titulo?: string; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${className}`}>
      {(titulo || accion) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          {titulo && <h2 className="font-medium text-slate-800">{titulo}</h2>}
          {accion}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Encabezado({ titulo, detalle, volver, acciones }: { titulo: ReactNode; detalle?: ReactNode; volver?: { to: string; texto: string }; acciones?: ReactNode }) {
  return (
    <div className="space-y-1">
      {volver && (
        <Link to={volver.to} className="text-sm text-marca-700 hover:underline">
          ← {volver.texto}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{titulo}</h1>
          {detalle && <div className="mt-1 text-sm text-slate-600">{detalle}</div>}
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>
    </div>
  );
}

export function Buscador({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden>
        <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        className={`${claseInput} pl-8`}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}

/* ───────────── Diálogo (dialog nativo: foco y Escape incluidos) ───────────── */

export function Dialogo({ abierto, onCerrar, titulo, children, ancho = "max-w-lg" }: { abierto: boolean; onCerrar: () => void; titulo: string; children: ReactNode; ancho?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  // El evento "close" también salta cuando lo cerramos por código (abierto → false);
  // solo hay que avisar cuando lo cerró la persona (Escape) estando abierto.
  const abiertoRef = useRef(abierto);
  abiertoRef.current = abierto;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      // Sin esto el foco cae en la ✕; mejor en el primer campo para escribir de una vez.
      d.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")?.focus();
    }
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      onClose={() => abiertoRef.current && onCerrar()}
      onClick={(e) => e.target === ref.current && onCerrar()}
      className={`m-auto w-[calc(100%-2rem)] ${ancho} rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40`}
    >
      {abierto && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{titulo}</h2>
            <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Diálogo de "¿Seguro?" para acciones que no se pueden deshacer. */
export function Confirmar({
  abierto,
  titulo,
  children,
  textoBoton,
  peligro = false,
  ocupado,
  error,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  textoBoton: string;
  peligro?: boolean;
  ocupado?: boolean;
  error?: string | null;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <div className="space-y-3 text-sm text-slate-700">{children}</div>
      {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante={peligro ? "peligroLleno" : "primario"} disabled={ocupado} onClick={onConfirmar}>
          {ocupado ? "Un momento…" : textoBoton}
        </Boton>
      </div>
    </Dialogo>
  );
}

/* ───────────── Combo con búsqueda (para escoger cliente, bus, producto…) ───────────── */

export interface Opcion {
  id: number;
  etiqueta: string;
  detalle?: string;
  buscarEn?: string;
}

export function ComboBusqueda({
  opciones,
  valor,
  onChange,
  placeholder = "Buscar…",
  sinValor = "Sin asignar",
  permitirVacio = true,
  autoFocus,
}: {
  opciones: Opcion[];
  valor: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  sinValor?: string;
  permitirVacio?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const seleccionada = opciones.find((o) => o.id === valor) ?? null;
  const filtradas = useMemo(
    () => opciones.filter((o) => coincide(texto, o.etiqueta, o.detalle, o.buscarEn)).slice(0, 50),
    [opciones, texto],
  );

  function escoger(o: Opcion | null) {
    onChange(o?.id ?? null);
    setTexto("");
    setAbierto(false);
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        className={claseInput}
        placeholder={seleccionada ? seleccionada.etiqueta : placeholder}
        value={abierto ? texto : (seleccionada?.etiqueta ?? "")}
        onFocus={() => {
          setAbierto(true);
          setActivo(0);
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActivo((a) => Math.min(a + 1, filtradas.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActivo((a) => Math.max(a - 1, 0)));
          else if (e.key === "Enter" && abierto && filtradas[activo]) (e.preventDefault(), escoger(filtradas[activo]));
          else if (e.key === "Escape" && abierto) (e.preventDefault(), e.stopPropagation(), setAbierto(false));
        }}
      />
      {abierto && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {permitirVacio && (
            <li role="option" aria-selected={valor === null}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escoger(null)} className="w-full px-3 py-1.5 text-left text-slate-500 hover:bg-slate-50">
                {sinValor}
              </button>
            </li>
          )}
          {filtradas.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === valor}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escoger(o)}
                onMouseEnter={() => setActivo(i)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left ${i === activo ? "bg-marca-50" : ""}`}
              >
                <span className={o.id === valor ? "font-medium" : ""}>{o.etiqueta}</span>
                {o.detalle && <span className="shrink-0 text-xs text-slate-500">{o.detalle}</span>}
              </button>
            </li>
          ))}
          {!filtradas.length && <li className="px-3 py-1.5 text-slate-500">Nada coincide</li>}
        </ul>
      )}
    </div>
  );
}

/* ───────────── Ordenar ───────────── */

export function SelectorOrden<T extends string>({ valor, opciones, onChange }: { valor: T; opciones: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="whitespace-nowrap">Ordenar por</span>
      <select className={`${claseInput} w-auto`} value={valor} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.keys(opciones) as T[]).map((k) => (
          <option key={k} value={k}>
            {opciones[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
