import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, enviar, type BusFila, type ClienteFila } from "../api";
import { Aviso, Boton, Buscador, Campo, claseInput, coincide, ComboBusqueda, Dialogo, Encabezado, fechaCorta, SelectorOrden } from "../components/ui";

const ORDEN = { cliente: "Cliente", trabajos: "Más trabajos", reciente: "Más reciente" } as const;
type Orden = keyof typeof ORDEN;

export const nombreBus = (b: { nombre: string | null; placa: string | null }) => b.nombre ?? b.placa ?? "Sin nombre";

export function Buses() {
  const lista = useQuery({ queryKey: ["buses"], queryFn: () => api<BusFila[]>("/buses") });
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("cliente");
  const [nuevo, setNuevo] = useState(false);
  const navegar = useNavigate();

  const filas = useMemo(() => {
    const xs = (lista.data ?? []).filter((b) => coincide(busqueda, b.nombre, b.placa, b.cliente, b.descripcion));
    if (orden === "trabajos") return xs.toSorted((a, b) => b.trabajos - a.trabajos);
    if (orden === "reciente") return xs.toSorted((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? ""));
    return xs;
  }, [lista.data, busqueda, orden]);
  const conPlaca = lista.data?.filter((b) => b.placa).length ?? 0;

  return (
    <section className="space-y-4">
      <Encabezado
        titulo="Buses"
        detalle={lista.data && `${lista.data.length} buses · ${conPlaca} con placa`}
        acciones={
          <Boton variante="primario" onClick={() => setNuevo(true)}>
            + Nuevo bus
          </Boton>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, placa o cliente" />
        <SelectorOrden valor={orden} opciones={ORDEN} onChange={setOrden} />
      </div>

      {lista.isLoading && <p className="text-slate-500">Cargando…</p>}
      {lista.error && <Aviso>No se pudo cargar la lista: {lista.error.message}</Aviso>}

      {lista.data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Bus</th>
                <th className="px-2 py-2 font-medium">Placa</th>
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 text-right font-medium">Trabajos</th>
                <th className="px-4 py-2 font-medium">Último presupuesto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((b) => (
                <tr key={b.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navegar(`/buses/${b.id}`)}>
                  <td className="px-4 py-2">
                    <Link to={`/buses/${b.id}`} className="font-medium text-slate-900 hover:text-marca-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {b.nombre ?? <span className="font-normal text-slate-500">Sin nombre</span>}
                    </Link>
                    {b.descripcion && <div className="text-xs text-slate-500">{b.descripcion}</div>}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{b.placa ?? <span className="font-sans text-slate-300">—</span>}</td>
                  <td className="px-2 py-2 text-slate-700">{b.cliente ?? <span className="text-slate-400">Sin cliente</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{b.trabajos}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-600">{fechaCorta(b.ultima)}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Ningún bus coincide con “{busqueda}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <NuevoBus abierto={nuevo} onCerrar={() => setNuevo(false)} />
    </section>
  );
}

/** Opciones de cliente para un combo (todos los clientes). */
export function useOpcionesClientes() {
  const q = useQuery({ queryKey: ["clientes"], queryFn: () => api<ClienteFila[]>("/clientes") });
  return useMemo(() => (q.data ?? []).map((c) => ({ id: c.id, etiqueta: c.nombre, buscarEn: c.alias.join(" ") })), [q.data]);
}

export function NuevoBus({
  abierto,
  onCerrar,
  clienteId = null,
  irAlCrear = true,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  clienteId?: number | null;
  irAlCrear?: boolean;
  onCreado?: (id: number) => void;
}) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const opciones = useOpcionesClientes();
  const [cliente, setCliente] = useState<number | null>(clienteId);
  const crear = useMutation({
    mutationFn: (d: object) => enviar<{ id: number }>("POST", "/buses", d),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["buses"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      if (clienteId) qc.invalidateQueries({ queryKey: ["cliente", clienteId] });
      onCerrar();
      onCreado?.(id);
      if (irAlCrear) navegar(`/buses/${id}`);
    },
  });
  const cerrar = () => (crear.reset(), setCliente(clienteId), onCerrar());
  return (
    <Dialogo abierto={abierto} onCerrar={cerrar} titulo="Nuevo bus">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          crear.mutate({
            clienteId: clienteId ?? cliente,
            placa: String(f.get("placa")),
            nombre: String(f.get("nombre")),
            descripcion: String(f.get("descripcion")),
          });
        }}
      >
        {clienteId === null && (
          <Campo etiqueta="Cliente">
            <ComboBusqueda opciones={opciones} valor={cliente} onChange={setCliente} placeholder="Buscar cliente…" sinValor="Sin cliente" />
          </Campo>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Placa" ayuda="Si la tienes">
            <input name="placa" maxLength={20} className={`${claseInput} uppercase`} placeholder="C-123ABC" autoFocus />
          </Campo>
          <Campo etiqueta="Nombre" ayuda="Como le dicen al bus">
            <input name="nombre" maxLength={80} className={claseInput} placeholder="La Estrella" />
          </Campo>
        </div>
        <Campo etiqueta="Descripción (opcional)">
          <input name="descripcion" maxLength={200} className={claseInput} placeholder="Blue Bird, International…" />
        </Campo>
        {crear.error && <Aviso>{crear.error.message}</Aviso>}
        <div className="flex justify-end gap-2 pt-2">
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={crear.isPending}>
            {crear.isPending ? "Guardando…" : "Crear bus"}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
