import { useId, useMemo, useState } from "react";
import type { ProductoFila } from "../api";
import { claseInput, coincide, fechaCorta, formatoQ } from "../components/ui";

/** Precio que se sugiere al escoger un producto: el de referencia, o si no hay, el último cobrado. */
export const precioSugerido = (p: ProductoFila) => p.precioReferencia ?? p.ultimoPrecio;

/**
 * Descripción de una línea con sugerencias del catálogo. Se puede escribir cualquier
 * cosa; si se escoge una sugerencia, se llena el nombre y el precio sugerido.
 * Enter (sin la lista abierta) avisa para crear la línea siguiente.
 */
export function CampoDescripcion({
  valor,
  productos,
  onCambio,
  onElegir,
  onEnter,
  autoFocus,
  enlazado,
}: {
  valor: string;
  productos: ProductoFila[];
  onCambio: (texto: string) => void;
  onElegir: (p: ProductoFila) => void;
  onEnter: () => void;
  autoFocus?: boolean;
  enlazado: boolean;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const sugerencias = useMemo(() => {
    if (valor.trim().length < 2) return [];
    return productos
      .filter((p) => p.activo && coincide(valor, p.nombre, ...p.alias))
      .sort((a, b) => b.veces - a.veces)
      .slice(0, 8);
  }, [valor, productos]);
  const mostrar = abierto && sugerencias.length > 0;

  function elegir(p: ProductoFila) {
    onElegir(p);
    setAbierto(false);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-label="Descripción"
        autoFocus={autoFocus}
        className={`${claseInput} ${enlazado ? "border-l-4 border-l-marca-600" : ""}`}
        title={enlazado ? "Enlazado al catálogo" : undefined}
        placeholder="Descripción del trabajo…"
        value={valor}
        onChange={(e) => {
          onCambio(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={(e) => {
          if (mostrar && e.key === "ArrowDown") (e.preventDefault(), setActivo((a) => Math.min(a + 1, sugerencias.length - 1)));
          else if (mostrar && e.key === "ArrowUp") (e.preventDefault(), setActivo((a) => Math.max(a - 1, 0)));
          else if (mostrar && (e.key === "Enter" || e.key === "Tab") && sugerencias[activo] && !e.shiftKey) {
            if (e.key === "Enter" || valor.trim() !== sugerencias[activo].nombre) {
              e.preventDefault();
              elegir(sugerencias[activo]);
            }
          } else if (mostrar && e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setAbierto(false));
          else if (e.key === "Enter") (e.preventDefault(), onEnter());
        }}
      />
      {mostrar && (
        <ul id={`${id}-lista`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-[20rem] overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {sugerencias.map((p, i) => {
            const precio = precioSugerido(p);
            return (
              <li key={p.id} role="option" aria-selected={i === activo}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(p)}
                  onMouseEnter={() => setActivo(i)}
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left ${i === activo ? "bg-marca-50" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{p.nombre}</span>
                    <span className="text-xs text-slate-500">
                      {p.veces} {p.veces === 1 ? "vez" : "veces"}
                      {p.ultimaFecha && ` · último ${fechaCorta(p.ultimaFecha)}`}
                    </span>
                  </span>
                  {precio !== null && <span className="shrink-0 tabular-nums text-slate-700">{formatoQ(precio)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
