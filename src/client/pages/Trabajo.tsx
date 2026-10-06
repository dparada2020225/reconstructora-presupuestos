import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { nombreDocumento } from "../../shared/presupuesto";
import { api, enviar, type EstadoTrabajo, type TrabajoDetalle } from "../api";
import { Aviso, Boton, Caja, claseInput, Encabezado, ESTADO_TRABAJO, fechaCorta, formatoQ, Insignia } from "../components/ui";

export function Trabajo() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["trabajo", id], queryFn: () => api<TrabajoDetalle>(`/trabajos/${id}`) });
  const cambiar = useMutation({
    mutationFn: (datos: { estado?: EstadoTrabajo; notas?: string }) => enviar("PATCH", `/trabajos/${id}`, datos),
    onSuccess: () => {
      for (const k of ["trabajo", "presupuestos", "presupuesto", "cliente", "bus", "estadisticas"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const t = q.data;
  if (q.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (q.error || !t) return <Aviso>{q.error?.message ?? "No encontrado"}</Aviso>;

  return (
    <section className="space-y-4">
      <Encabezado
        titulo={`Trabajo de ${t.cliente}`}
        volver={{ to: `/clientes/${t.clienteId}`, texto: t.cliente }}
        detalle={
          <>
            {t.busId ? (
              <Link className="text-marca-700 hover:underline" to={`/buses/${t.busId}`}>
                {[t.placa, t.bus].filter(Boolean).join(" / ")}
              </Link>
            ) : (
              "Sin bus"
            )}
            {" · desde "}
            {fechaCorta(t.fecha)}
            {t.fechaFin && ` · terminado ${fechaCorta(t.fechaFin)}`}
          </>
        }
        acciones={
          <Link to={`/presupuestos/nuevo?trabajo=${t.id}`} className="inline-flex items-center rounded-md bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-600">
            + Agregar extra
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Caja titulo="Presupuestos">
          <ul className="divide-y divide-slate-100">
            {t.presupuestos.map((p) => (
              <li key={p.id}>
                <Link to={`/presupuestos/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                  <span>
                    <span className="font-medium text-marca-700">{nombreDocumento(p)}</span>
                    <span className="ml-2 text-sm text-slate-500">{fechaCorta(p.fecha)}</span>
                    {p.estado === "borrador" && <Insignia clase="ml-2 bg-amber-100 text-amber-900">Borrador</Insignia>}
                  </span>
                  <span className="text-right tabular-nums">
                    {formatoQ(p.total)}
                    {p.cerradoEn !== null && <span className="block text-xs text-slate-500">cerrado en {formatoQ(p.cerradoEn)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-sm">
            {t.cotizado !== t.monto && (
              <p className="flex justify-between text-slate-600">
                <span>Cotizado</span>
                <span className="tabular-nums">{formatoQ(t.cotizado)}</span>
              </p>
            )}
            <p className="flex justify-between font-medium">
              <span>Total del trabajo</span>
              <span className="tabular-nums">{formatoQ(t.monto)}</span>
            </p>
          </div>
        </Caja>

        <div className="space-y-4">
          <Caja titulo="Estado del trabajo">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Estado del trabajo">
              {(Object.keys(ESTADO_TRABAJO) as EstadoTrabajo[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={t.estado === k}
                  disabled={cambiar.isPending}
                  onClick={() => t.estado !== k && cambiar.mutate({ estado: k })}
                  className={`rounded-md border px-2 py-1.5 text-sm ${t.estado === k ? `border-transparent font-medium ${ESTADO_TRABAJO[k].clase}` : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {ESTADO_TRABAJO[k].texto}
                </button>
              ))}
            </div>
            {cambiar.error && <div className="mt-2"><Aviso>{cambiar.error.message}</Aviso></div>}
          </Caja>
          <NotasTrabajo key={t.notas ?? ""} inicial={t.notas ?? ""} guardando={cambiar.isPending} onGuardar={(notas) => cambiar.mutate({ notas })} />
        </div>
      </div>
    </section>
  );
}

function NotasTrabajo({ inicial, guardando, onGuardar }: { inicial: string; guardando: boolean; onGuardar: (n: string) => void }) {
  const [notas, setNotas] = useState(inicial);
  return (
    <Caja titulo="Notas del trabajo">
      <textarea rows={4} maxLength={4000} className={claseInput} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Pagos, acuerdos, pendientes…" />
      {notas !== inicial && (
        <div className="mt-2 flex justify-end">
          <Boton variante="primario" disabled={guardando} onClick={() => onGuardar(notas)}>
            Guardar notas
          </Boton>
        </div>
      )}
    </Caja>
  );
}
