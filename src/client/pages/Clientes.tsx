import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { claveCliente } from "../../shared/claves";
import { api, enviar, type ClienteFila } from "../api";
import { PanelDuplicados } from "../components/unir";
import { Aviso, Boton, Buscador, Campo, claseInput, coincide, Dialogo, Encabezado, fechaCorta, SelectorOrden } from "../components/ui";

const ORDEN = { nombre: "Nombre", trabajos: "Más trabajos", reciente: "Más reciente" } as const;
type Orden = keyof typeof ORDEN;

const clave = (c: ClienteFila) => claveCliente(c.nombre);
const detalle = (c: ClienteFila) =>
  `${c.trabajos} ${c.trabajos === 1 ? "trabajo" : "trabajos"} · ${c.buses} ${c.buses === 1 ? "bus" : "buses"}${c.ultima ? ` · último ${fechaCorta(c.ultima)}` : ""}`;

export function Clientes() {
  const lista = useQuery({ queryKey: ["clientes"], queryFn: () => api<ClienteFila[]>("/clientes") });
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("nombre");
  const [nuevo, setNuevo] = useState(false);
  const navegar = useNavigate();

  const filas = useMemo(() => {
    const xs = (lista.data ?? []).filter((c) => coincide(busqueda, c.nombre, c.telefono, ...c.alias));
    if (orden === "trabajos") return xs.toSorted((a, b) => b.trabajos - a.trabajos || a.nombre.localeCompare(b.nombre));
    if (orden === "reciente") return xs.toSorted((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? ""));
    return xs;
  }, [lista.data, busqueda, orden]);

  return (
    <section className="space-y-4">
      <Encabezado
        titulo="Clientes"
        detalle={lista.data && `${lista.data.length} clientes`}
        acciones={
          <Boton variante="primario" onClick={() => setNuevo(true)}>
            + Nuevo cliente
          </Boton>
        }
      />

      {lista.data && <PanelDuplicados tipo="clientes" items={lista.data} clave={clave} nombre={(c) => c.nombre} detalle={detalle} peso={(c) => c.trabajos} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o teléfono" />
        <SelectorOrden valor={orden} opciones={ORDEN} onChange={setOrden} />
      </div>

      {lista.isLoading && <p className="text-slate-500">Cargando…</p>}
      {lista.error && <Aviso>No se pudo cargar la lista: {lista.error.message}</Aviso>}

      {lista.data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Teléfono</th>
                <th className="px-2 py-2 text-right font-medium">Buses</th>
                <th className="px-2 py-2 text-right font-medium">Trabajos</th>
                <th className="px-4 py-2 font-medium">Último presupuesto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  onClick={() => navegar(`/clientes/${c.id}`)}
                >
                  <td className="px-4 py-2">
                    <Link to={`/clientes/${c.id}`} className="font-medium text-slate-900 hover:text-marca-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {c.nombre}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{c.telefono ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.buses}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.trabajos}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-600">{fechaCorta(c.ultima)}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Ningún cliente coincide con “{busqueda}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <NuevoCliente abierto={nuevo} onCerrar={() => setNuevo(false)} nombreInicial={busqueda} />
    </section>
  );
}

function NuevoCliente({ abierto, onCerrar, nombreInicial }: { abierto: boolean; onCerrar: () => void; nombreInicial: string }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const crear = useMutation({
    mutationFn: (d: { nombre: string; telefono: string; notas: string }) => enviar<{ id: number }>("POST", "/clientes", d),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      navegar(`/clientes/${id}`);
    },
  });
  return (
    <Dialogo abierto={abierto} onCerrar={() => (crear.reset(), onCerrar())} titulo="Nuevo cliente">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          crear.mutate({ nombre: String(f.get("nombre")), telefono: String(f.get("telefono")), notas: String(f.get("notas")) });
        }}
      >
        <Campo etiqueta="Nombre">
          <input name="nombre" required minLength={2} maxLength={120} defaultValue={nombreInicial} className={claseInput} autoFocus />
        </Campo>
        <Campo etiqueta="Teléfono (opcional)">
          <input name="telefono" maxLength={40} inputMode="tel" className={claseInput} />
        </Campo>
        <Campo etiqueta="Notas (opcional)">
          <textarea name="notas" maxLength={1000} rows={2} className={claseInput} />
        </Campo>
        {crear.error && <Aviso>{crear.error.message}</Aviso>}
        <div className="flex justify-end gap-2 pt-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={crear.isPending}>
            {crear.isPending ? "Guardando…" : "Crear cliente"}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
