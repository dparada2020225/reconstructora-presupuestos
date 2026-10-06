import { useId, useRef, useState, type ReactNode } from "react";

/**
 * Gráficas sencillas en SVG (sin librerías). Una sola serie por gráfica:
 * color de serie 1, marcas delgadas, grid en línea fina y tooltip al pasar el mouse.
 */

const SERIE = "#2a78d6";
const SERIE_HOVER = "#1c5cab";
const GRID = "#e5e4e0";
const TEXTO_SEC = "#52514e";

export const formatoQ = (n: number) => `Q${Math.round(n).toLocaleString("en-US")}`;
export function formatoQCorto(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `Q${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)} M`;
  if (a >= 10_000) return `Q${Math.round(n / 1000)} mil`;
  return formatoQ(n);
}

/** Escala "bonita" para el eje: 0 … máximo redondeado y 4 marcas. */
function marcas(max: number) {
  if (max <= 0) return { tope: 1, ticks: [0, 1] };
  const paso0 = max / 4;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= paso0) ?? paso0;
  const tope = Math.ceil(max / paso) * paso;
  return { tope, ticks: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  );
}

/* ───────────── Columnas verticales (una serie) ───────────── */

export function Columnas({
  datos,
  formato = (n: number) => n.toLocaleString("en-US"),
  formatoEje = formato,
  alto = 220,
  titulo,
}: {
  datos: { etiqueta: string; valor: number; detalle?: string }[];
  formato?: (n: number) => string;
  formatoEje?: (n: number) => string;
  alto?: number;
  titulo: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const ancho = 640;
  const m = { izq: 64, der: 8, arr: 12, aba: 28 };
  const { tope, ticks } = marcas(Math.max(...datos.map((d) => d.valor), 0));
  const banda = (ancho - m.izq - m.der) / Math.max(datos.length, 1);
  const barra = Math.min(24, banda * 0.6);
  const y = (v: number) => m.arr + (alto - m.arr - m.aba) * (1 - v / tope);
  const base = y(0);

  return (
    <div ref={caja} className="relative">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full" role="img" aria-label={titulo}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.izq} x2={ancho - m.der} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={m.izq - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXTO_SEC} className="tabular-nums">
              {formatoEje(t)}
            </text>
          </g>
        ))}
        {datos.map((d, i) => {
          const cx = m.izq + banda * i + banda / 2;
          const h = base - y(d.valor);
          const r = Math.min(4, h, barra / 2);
          const x0 = cx - barra / 2;
          const top = y(d.valor);
          // Barra con esquinas redondeadas arriba y base recta.
          const path =
            h <= 0
              ? ""
              : `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barra - r} Q${x0 + barra},${top} ${x0 + barra},${top + r} V${base} Z`;
          return (
            <g
              key={d.etiqueta}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.etiqueta}: ${formato(d.valor)}`}
            >
              <rect x={cx - banda / 2} y={m.arr} width={banda} height={alto - m.arr - m.aba} fill="transparent" />
              <path d={path} fill={hover === i ? SERIE_HOVER : SERIE} />
              <text x={cx} y={alto - 10} textAnchor="middle" fontSize={11} fill={TEXTO_SEC}>
                {d.etiqueta}
              </text>
            </g>
          );
        })}
        <line x1={m.izq} x2={ancho - m.der} y1={base} y2={base} stroke="#c3c2b7" strokeWidth={1} />
      </svg>
      {hover !== null && caja.current && (
        <Tooltip
          x={((m.izq + banda * hover + banda / 2) / ancho) * caja.current.clientWidth}
          y={(y(datos[hover].valor) / alto) * caja.current.clientHeight}
        >
          <div className="font-semibold text-slate-900">{formato(datos[hover].valor)}</div>
          <div className="text-slate-500">{datos[hover].detalle ?? datos[hover].etiqueta}</div>
        </Tooltip>
      )}
    </div>
  );
}

/* ───────────── Barras horizontales (ranking) ───────────── */

export function BarrasH({
  datos,
  formato = (n: number) => n.toLocaleString("en-US"),
  titulo,
}: {
  datos: { etiqueta: string; valor: number; detalle?: string }[];
  formato?: (n: number) => string;
  titulo: string;
}) {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <ul className="space-y-1.5" aria-label={titulo}>
      {datos.map((d) => (
        <li key={d.etiqueta} className="group grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]" title={d.detalle}>
          <span className="truncate text-slate-700" title={d.etiqueta}>
            {d.etiqueta}
          </span>
          <span className="flex items-center gap-2">
            <span
              className="h-3.5 rounded-r-[4px] transition-colors group-hover:brightness-90"
              style={{ width: `${Math.max((d.valor / max) * 78, 0.5)}%`, background: SERIE }}
            />
            <span className="whitespace-nowrap text-xs text-slate-600 tabular-nums">{formato(d.valor)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Línea (una serie en el tiempo) ───────────── */

export function Linea({
  datos,
  formato = (n: number) => n.toLocaleString("en-US"),
  alto = 220,
  titulo,
}: {
  datos: { etiqueta: string; valor: number; detalle?: string }[];
  formato?: (n: number) => string;
  alto?: number;
  titulo: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const idClip = useId();
  const ancho = 640;
  const m = { izq: 64, der: 16, arr: 16, aba: 28 };
  const { tope, ticks } = marcas(Math.max(...datos.map((d) => d.valor), 0));
  const paso = datos.length > 1 ? (ancho - m.izq - m.der) / (datos.length - 1) : 0;
  const x = (i: number) => (datos.length > 1 ? m.izq + paso * i : (m.izq + ancho - m.der) / 2);
  const y = (v: number) => m.arr + (alto - m.arr - m.aba) * (1 - v / tope);
  const puntos = datos.map((d, i) => `${x(i)},${y(d.valor)}`).join(" ");

  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ancho;
    let mejor = 0;
    datos.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(mejor) - px)) mejor = i;
    });
    setHover(mejor);
  };

  return (
    <div ref={caja} className="relative">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full touch-none"
        role="img"
        aria-label={titulo}
        onPointerMove={mover}
        onPointerLeave={() => setHover(null)}
      >
        <clipPath id={idClip}>
          <rect x={0} y={0} width={ancho} height={alto} />
        </clipPath>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.izq} x2={ancho - m.der} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={m.izq - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXTO_SEC} className="tabular-nums">
              {formato(t)}
            </text>
          </g>
        ))}
        {datos.map((d, i) => (
          <text key={d.etiqueta} x={x(i)} y={alto - 10} textAnchor="middle" fontSize={11} fill={TEXTO_SEC}>
            {d.etiqueta}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.arr} y2={alto - m.aba} stroke="#c3c2b7" strokeWidth={1} />}
        <polyline points={puntos} fill="none" stroke={SERIE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${idClip})`} />
        {datos.map((d, i) => (
          <circle key={d.etiqueta} cx={x(i)} cy={y(d.valor)} r={hover === i ? 5 : 4} fill={SERIE} stroke="#fff" strokeWidth={2} />
        ))}
      </svg>
      {hover !== null && caja.current && (
        <Tooltip x={(x(hover) / ancho) * caja.current.clientWidth} y={(y(datos[hover].valor) / alto) * caja.current.clientHeight}>
          <div className="font-semibold text-slate-900">{formato(datos[hover].valor)}</div>
          <div className="text-slate-500">{datos[hover].detalle ?? datos[hover].etiqueta}</div>
        </Tooltip>
      )}
    </div>
  );
}

/* ───────────── Piezas de tablero ───────────── */

export function Tarjeta({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function Indicador({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

/** Gráfica con botón para ver los mismos datos como tabla. */
export function ConTabla({ grafica, tabla }: { grafica: ReactNode; tabla: ReactNode }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <div>
      {verTabla ? <div className="max-h-96 overflow-auto">{tabla}</div> : grafica}
      <button className="mt-2 text-xs font-medium text-marca-600 hover:underline" onClick={() => setVerTabla((v) => !v)}>
        {verTabla ? "Ver gráfica" : "Ver como tabla"}
      </button>
    </div>
  );
}

export function Tabla({ columnas, filas }: { columnas: { titulo: string; derecha?: boolean }[]; filas: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-white">
        <tr className="border-b border-slate-200 text-left text-slate-500">
          {columnas.map((c) => (
            <th key={c.titulo} className={`py-1.5 pr-3 font-medium ${c.derecha ? "text-right" : ""}`}>
              {c.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            {f.map((v, j) => (
              <td key={j} className={`py-1.5 pr-3 ${columnas[j]?.derecha ? "text-right tabular-nums" : ""}`}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
