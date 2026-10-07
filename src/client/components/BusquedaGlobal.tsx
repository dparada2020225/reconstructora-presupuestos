import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api, type BusFila, type ClienteFila, type PresupuestoFila, type ProductoFila } from "../api";
import { buscarTodo, type TipoResultado } from "../busqueda";
import { claseInput, Dialogo } from "./ui";

const ETIQUETA: Record<TipoResultado, string> = { presupuesto: "Presupuestos", cliente: "Clientes", bus: "Buses", producto: "Productos" };

/** ¿La tecla se escribió dentro de un campo? (ahí no se usan los atajos de una sola tecla). */
export function escribiendo(ev: KeyboardEvent) {
  const t = ev.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

/** Atajos de toda la app. Los del editor (Ctrl+S, Ctrl+P, Enter) viven en el editor. */
export const ATAJOS: { teclas: string[]; que: string; donde?: string }[] = [
  { teclas: ["Ctrl", "K"], que: "Buscar (también la tecla /)" },
  { teclas: ["N"], que: "Nuevo presupuesto" },
  { teclas: ["?"], que: "Ver esta lista de atajos" },
  { teclas: ["Ctrl", "S"], que: "Guardar", donde: "Editor" },
  { teclas: ["Ctrl", "P"], que: "Ver el PDF", donde: "Editor" },
  { teclas: ["Enter"], que: "Línea nueva debajo", donde: "Editor" },
  { teclas: ["Esc"], que: "Cerrar ventanas" },
];

/** Botón "Buscar" del encabezado + ventana de búsqueda + atajos globales (Ctrl+K, /, N, ?). */
export function BusquedaGlobal() {
  const [abierta, setAbierta] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const navegar = useNavigate();

  useEffect(() => {
    const atajo = (ev: KeyboardEvent) => {
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === "k") {
        ev.preventDefault();
        setAbierta(true);
        return;
      }
      if (ctrl || ev.altKey || escribiendo(ev) || document.querySelector("dialog[open]")) return;
      if (ev.key === "/") {
        ev.preventDefault();
        setAbierta(true);
      } else if (ev.key === "?") {
        ev.preventDefault();
        setAyuda(true);
      } else if (ev.key === "n" || ev.key === "N") {
        ev.preventDefault();
        navegar("/presupuestos/nuevo");
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, [navegar]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-marca-600/60 px-3 py-1.5 text-sm text-marca-100 hover:bg-marca-600 sm:max-w-xs"
        aria-keyshortcuts="Control+K /"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" strokeLinecap="round" />
        </svg>
        <span className="flex-1 truncate text-left">Buscar…</span>
        <kbd className="hidden rounded border border-marca-100/40 px-1.5 text-xs sm:inline">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setAyuda(true)}
        className="hidden h-7 w-7 items-center justify-center rounded-full text-sm text-marca-100 hover:bg-marca-600 sm:flex"
        title="Atajos de teclado (?)"
        aria-label="Atajos de teclado"
      >
        ?
      </button>
      <Dialogo abierto={abierta} onCerrar={() => setAbierta(false)} titulo="Buscar" ancho="max-w-xl">
        <VentanaBusqueda
          onIr={(ruta) => {
            setAbierta(false);
            navegar(ruta);
          }}
        />
      </Dialogo>
      <Dialogo abierto={ayuda} onCerrar={() => setAyuda(false)} titulo="Atajos de teclado">
        <TablaAtajos />
      </Dialogo>
    </>
  );
}

function VentanaBusqueda({ onIr }: { onIr: (ruta: string) => void }) {
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState(0);
  // Las mismas consultas (y caché) que las páginas de cada lista.
  const presupuestos = useQuery({ queryKey: ["presupuestos"], queryFn: () => api<PresupuestoFila[]>("/presupuestos") });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => api<ClienteFila[]>("/clientes") });
  const buses = useQuery({ queryKey: ["buses"], queryFn: () => api<BusFila[]>("/buses") });
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => api<ProductoFila[]>("/productos") });
  const cargando = presupuestos.isLoading || clientes.isLoading || buses.isLoading || productos.isLoading;

  const resultados = useMemo(
    () => buscarTodo({ presupuestos: presupuestos.data, clientes: clientes.data, buses: buses.data, productos: productos.data }, texto),
    [presupuestos.data, clientes.data, buses.data, productos.data, texto],
  );
  const elegido = Math.min(sel, Math.max(0, resultados.length - 1));

  useEffect(() => {
    document.getElementById(`resultado-${elegido}`)?.scrollIntoView({ block: "nearest" });
  }, [elegido]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        className={claseInput}
        placeholder="Cliente, placa, bus, producto o #número"
        value={texto}
        autoComplete="off"
        role="combobox"
        aria-expanded={resultados.length > 0}
        aria-controls="resultados-busqueda"
        aria-activedescendant={resultados.length ? `resultado-${elegido}` : undefined}
        onChange={(e) => {
          setTexto(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel(Math.min(elegido + 1, resultados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel(Math.max(elegido - 1, 0));
          } else if (e.key === "Enter" && resultados[elegido]) {
            e.preventDefault();
            onIr(resultados[elegido].ruta);
          }
        }}
      />
      {!texto.trim() ? (
        <p className="text-sm text-slate-500">Escribe para buscar en presupuestos, clientes, buses y productos. ↑ ↓ para moverte, Enter para abrir.</p>
      ) : cargando && !resultados.length ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : !resultados.length ? (
        <p className="text-sm text-slate-500">Nada coincide con “{texto.trim()}”.</p>
      ) : (
        <ul id="resultados-busqueda" role="listbox" className="max-h-[60vh] space-y-0.5 overflow-y-auto">
          {resultados.map((r, i) => (
            <li key={`${r.tipo}-${r.id}`} role="presentation">
              {(i === 0 || resultados[i - 1].tipo !== r.tipo) && (
                <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{ETIQUETA[r.tipo]}</p>
              )}
              <button
                type="button"
                id={`resultado-${i}`}
                role="option"
                aria-selected={i === elegido}
                onMouseMove={() => setSel(i)}
                onClick={() => onIr(r.ruta)}
                className={`block w-full rounded-md px-2 py-1.5 text-left ${i === elegido ? "bg-marca-50 ring-1 ring-marca-100" : "hover:bg-slate-50"}`}
              >
                <span className="block truncate text-sm font-medium text-slate-900">{r.titulo}</span>
                {r.detalle && <span className="block truncate text-xs text-slate-500">{r.detalle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TablaAtajos() {
  return (
    <table className="w-full text-sm">
      <tbody>
        {ATAJOS.map((a) => (
          <tr key={a.que} className="border-b border-slate-100 last:border-0">
            <td className="py-1.5 pr-4 whitespace-nowrap">
              {a.teclas.map((t, i) => (
                <span key={t}>
                  {i > 0 && <span className="px-0.5 text-slate-400">+</span>}
                  <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs">{t}</kbd>
                </span>
              ))}
            </td>
            <td className="py-1.5">
              {a.que}
              {a.donde && <span className="ml-1 text-xs text-slate-500">({a.donde})</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
