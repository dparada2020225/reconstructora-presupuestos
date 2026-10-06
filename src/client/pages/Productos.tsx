import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CATEGORIAS } from "../../shared/categorias";
import { claveProducto } from "../../shared/claves";
import { api, enviar, type ProductoFila } from "../api";
import { PanelDuplicados } from "../components/unir";
import { Aviso, Boton, Buscador, Campo, claseInput, coincide, Dialogo, Encabezado, fechaCorta, formatoQ, Insignia, SelectorOrden } from "../components/ui";

const ORDEN = { veces: "Más pedidos", nombre: "Nombre", reciente: "Usado hace poco" } as const;
type Orden = keyof typeof ORDEN;

const clave = (p: ProductoFila) => claveProducto(p.nombre);
const detalle = (p: ProductoFila) =>
  `${p.veces} ${p.veces === 1 ? "vez" : "veces"}${p.ultimoPrecio !== null ? ` · último ${formatoQ(p.ultimoPrecio)}` : ""}${p.ultimaFecha ? ` (${fechaCorta(p.ultimaFecha)})` : ""}`;

/** Categorías de siempre + las que ya existan en el catálogo. */
export function useCategorias(productos: { categoria: string | null }[] | undefined) {
  return useMemo(() => [...new Set([...CATEGORIAS, ...(productos ?? []).map((p) => p.categoria).filter((c): c is string => !!c)])].sort(), [productos]);
}

export function Productos() {
  const lista = useQuery({ queryKey: ["productos"], queryFn: () => api<ProductoFila[]>("/productos") });
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [orden, setOrden] = useState<Orden>("veces");
  const [nuevo, setNuevo] = useState(false);
  const navegar = useNavigate();
  const categorias = useCategorias(lista.data);

  const filas = useMemo(() => {
    const xs = (lista.data ?? []).filter(
      (p) =>
        (inactivos || p.activo) &&
        (!categoria || (categoria === "—" ? !p.categoria : p.categoria === categoria)) &&
        coincide(busqueda, p.nombre, p.categoria, ...p.alias),
    );
    if (orden === "veces") return xs.toSorted((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre));
    if (orden === "reciente") return xs.toSorted((a, b) => (b.ultimaFecha ?? "").localeCompare(a.ultimaFecha ?? ""));
    return xs;
  }, [lista.data, busqueda, categoria, inactivos, orden]);
  const activos = useMemo(() => (lista.data ?? []).filter((p) => p.activo), [lista.data]);

  return (
    <section className="space-y-4">
      <Encabezado
        titulo="Productos"
        detalle={lista.data && `${activos.length} en el catálogo${lista.data.length > activos.length ? ` · ${lista.data.length - activos.length} desactivados` : ""}`}
        acciones={
          <Boton variante="primario" onClick={() => setNuevo(true)}>
            + Nuevo producto
          </Boton>
        }
      />

      {lista.data && <PanelDuplicados tipo="productos" items={activos} clave={clave} nombre={(p) => p.nombre} detalle={detalle} peso={(p) => p.veces} />}

      <div className="flex flex-wrap items-center gap-3">
        <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar producto o trabajo" />
        <select className={`${claseInput} w-auto`} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="—">Sin categoría</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={inactivos} onChange={(e) => setInactivos(e.target.checked)} className="accent-marca-700" />
          Ver desactivados
        </label>
        <div className="sm:ml-auto">
          <SelectorOrden valor={orden} opciones={ORDEN} onChange={setOrden} />
        </div>
      </div>

      {lista.isLoading && <p className="text-slate-500">Cargando…</p>}
      {lista.error && <Aviso>No se pudo cargar el catálogo: {lista.error.message}</Aviso>}

      {lista.data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Producto / trabajo</th>
                <th className="px-2 py-2 font-medium">Categoría</th>
                <th className="px-2 py-2 text-right font-medium">Veces</th>
                <th className="px-2 py-2 text-right font-medium">Último precio</th>
                <th className="px-4 py-2 text-right font-medium">Precio de referencia</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navegar(`/productos/${p.id}`)}>
                  <td className="px-4 py-2">
                    <Link to={`/productos/${p.id}`} className="font-medium text-slate-900 hover:text-marca-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {p.nombre}
                    </Link>
                    {!p.activo && <Insignia clase="ml-2 bg-slate-200 text-slate-600">Desactivado</Insignia>}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">{p.categoria ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.veces}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {p.ultimoPrecio !== null ? formatoQ(p.ultimoPrecio) : <span className="text-slate-300">—</span>}
                    {p.ultimaFecha && <div className="text-xs text-slate-500">{fechaCorta(p.ultimaFecha)}</div>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.precioReferencia !== null ? formatoQ(p.precioReferencia) : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Nada coincide con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        “Último precio” es el precio por unidad la última vez que se cotizó. El precio de referencia es el que se sugerirá al armar un presupuesto.
      </p>

      <NuevoProducto abierto={nuevo} onCerrar={() => setNuevo(false)} nombreInicial={busqueda} categorias={categorias} />
    </section>
  );
}

function NuevoProducto({ abierto, onCerrar, nombreInicial, categorias }: { abierto: boolean; onCerrar: () => void; nombreInicial: string; categorias: string[] }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const crear = useMutation({
    mutationFn: (d: object) => enviar<{ id: number }>("POST", "/productos", d),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      navegar(`/productos/${id}`);
    },
  });
  return (
    <Dialogo abierto={abierto} onCerrar={() => (crear.reset(), onCerrar())} titulo="Nuevo producto">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const precio = String(f.get("precio")).trim();
          crear.mutate({
            nombre: String(f.get("nombre")),
            categoria: String(f.get("categoria")),
            precioReferencia: precio ? Number(precio) : null,
            unidad: String(f.get("unidad")),
          });
        }}
      >
        <Campo etiqueta="Nombre" ayuda="Como se escribe en el presupuesto">
          <input name="nombre" required minLength={2} maxLength={160} defaultValue={nombreInicial} className={claseInput} autoFocus />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Categoría">
            <input name="categoria" list="categorias-nuevo" maxLength={40} className={`${claseInput} uppercase`} />
            <datalist id="categorias-nuevo">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>
          <Campo etiqueta="Precio de referencia">
            <input name="precio" type="number" min={0} step="0.01" inputMode="decimal" className={claseInput} placeholder="Q" />
          </Campo>
          <Campo etiqueta="Unidad">
            <input name="unidad" maxLength={30} className={claseInput} placeholder="unidad, par, juego…" />
          </Campo>
        </div>
        {crear.error && <Aviso>{crear.error.message}</Aviso>}
        <div className="flex justify-end gap-2 pt-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={crear.isPending}>
            {crear.isPending ? "Guardando…" : "Crear producto"}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
