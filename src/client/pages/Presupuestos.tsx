import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { nombreDocumento } from "../../shared/presupuesto";
import { api, type PresupuestoFila } from "../api";
import { Aviso, Buscador, coincide, Encabezado, ESTADO_TRABAJO, fechaCorta, formatoQ, Insignia } from "../components/ui";

type Filtro = "todos" | "borrador" | "listo";

export function Presupuestos() {
  const lista = useQuery({ queryKey: ["presupuestos"], queryFn: () => api<PresupuestoFila[]>("/presupuestos") });
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [cuantos, setCuantos] = useState(60);
  const navegar = useNavigate();

  const borradores = lista.data?.filter((p) => p.estado === "borrador").length ?? 0;
  const filas = useMemo(
    () =>
      (lista.data ?? []).filter(
        (p) => (filtro === "todos" || p.estado === filtro) && coincide(busqueda, p.cliente, p.bus, p.placa, p.titulo, nombreDocumento(p)),
      ),
    [lista.data, busqueda, filtro],
  );

  return (
    <section className="space-y-4">
      <Encabezado
        titulo="Presupuestos"
        detalle={lista.data && `${lista.data.length} presupuestos`}
        acciones={
          <Link to="/presupuestos/nuevo" className="inline-flex items-center rounded-md bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-600">
            + Nuevo presupuesto
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar por cliente, bus o placa" />
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Filtrar por estado">
          {(
            [
              ["todos", "Todos"],
              ["borrador", `Borradores${borradores ? ` (${borradores})` : ""}`],
              ["listo", "Listos"],
            ] as [Filtro, string][]
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filtro === k}
              onClick={() => setFiltro(k)}
              className={`rounded px-2.5 py-1 ${filtro === k ? "bg-marca-700 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {lista.isLoading && <p className="text-slate-500">Cargando…</p>}
      {lista.error && <Aviso>No se pudo cargar la lista: {lista.error.message}</Aviso>}

      {lista.data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Bus</th>
                <th className="px-2 py-2 font-medium">Documento</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, cuantos).map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => navegar(`/presupuestos/${p.id}`)}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fechaCorta(p.fecha)}</td>
                  <td className="px-2 py-2">
                    <Link to={`/presupuestos/${p.id}`} className="font-medium text-slate-900 hover:text-marca-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {p.cliente}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{[p.placa, p.bus].filter(Boolean).join(" / ") || <span className="text-slate-300">—</span>}</td>
                  <td className="px-2 py-2 text-slate-700">{nombreDocumento(p)}</td>
                  <td className="space-x-1 px-2 py-2">
                    {p.estado === "borrador" ? <Insignia clase="bg-amber-100 text-amber-900">Borrador</Insignia> : null}
                    <Insignia clase={ESTADO_TRABAJO[p.estadoTrabajo].clase}>{ESTADO_TRABAJO[p.estadoTrabajo].texto}</Insignia>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {formatoQ(p.total)}
                    {p.cerradoEn !== null && <div className="text-xs text-slate-500">cerrado {formatoQ(p.cerradoEn)}</div>}
                  </td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    {lista.data.length ? "Nada coincide con la búsqueda." : "Todavía no hay presupuestos."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filas.length > cuantos && (
            <div className="border-t border-slate-100 p-2 text-center">
              <button type="button" className="text-sm text-marca-700 hover:underline" onClick={() => setCuantos((n) => n + 100)}>
                Ver más ({filas.length - cuantos})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
