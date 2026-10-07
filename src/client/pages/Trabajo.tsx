import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { porcentajeAbonado } from "../../shared/estados";
import { nombreDocumento } from "../../shared/presupuesto";
import { api, enviar, type TrabajoDetalle } from "../api";
import { Aro, Aviso, Boton, Caja, claseInput, Encabezado, ESTADO_PRESUPUESTO, ESTADO_TRABAJO, fechaCorta, formatoQ, Insignia } from "../components/ui";
import { DocumentoUnificado } from "../pdf/AccionesPdf";

export function Trabajo() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["trabajo", id], queryFn: () => api<TrabajoDetalle>(`/trabajos/${id}`) });
  const guardarNotas = useMutation({
    mutationFn: (notas: string) => enviar("PATCH", `/trabajos/${id}`, { notas }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trabajo"] }),
  });
  const t = q.data;
  if (q.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (q.error || !t) return <Aviso>{q.error?.message ?? "No encontrado"}</Aviso>;

  const vigentes = t.presupuestos.filter((p) => p.estado !== "cancelado");
  return (
    <section className="space-y-4">
      <Encabezado
        titulo={
          <>
            Trabajo de {t.cliente}
            <Insignia clase={`ml-3 align-middle ${ESTADO_TRABAJO[t.estado].clase}`}>{ESTADO_TRABAJO[t.estado].texto}</Insignia>
          </>
        }
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
                <Link to={`/presupuestos/${p.id}`} className={`flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 ${p.estado === "cancelado" ? "opacity-60" : ""}`}>
                  <span className="min-w-0">
                    <span className={`font-medium text-marca-700 ${p.estado === "cancelado" ? "line-through" : ""}`}>{nombreDocumento(p)}</span>
                    <span className="ml-2 text-sm text-slate-500">{fechaCorta(p.fecha)}</span>
                    <Insignia clase={`ml-2 ${ESTADO_PRESUPUESTO[p.estado].clase}`}>{ESTADO_PRESUPUESTO[p.estado].texto}</Insignia>
                  </span>
                  <span className="text-right tabular-nums">
                    {formatoQ(p.cerradoEn ?? p.total)}
                    <span className="block text-xs text-slate-500">
                      {p.cerradoEn !== null && `cotizado ${formatoQ(p.total)} · `}
                      {p.abonado > 0 ? `abonado ${formatoQ(p.abonado)}` : "sin abonos"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-sm">
            <p className="flex justify-between font-medium">
              <span>Total del trabajo</span>
              <span className="tabular-nums">{formatoQ(t.monto)}</span>
            </p>
            {t.presupuestos.length > vigentes.length && <p className="text-xs text-slate-500">Los presupuestos cancelados no suman.</p>}
          </div>
          {vigentes.length > 1 && (
            <div className="mt-3 max-w-sm">
              <DocumentoUnificado trabajoId={t.id} />
            </div>
          )}
        </Caja>

        <div className="space-y-4">
          <Caja titulo="Abonos de todo el trabajo">
            <div className="flex items-center gap-4">
              <Aro valor={porcentajeAbonado(t.abonado, t.monto)} etiqueta="Abonado del trabajo" />
              <dl className="space-y-0.5 text-sm">
                <div>
                  <dt className="inline text-slate-500">Abonado </dt>
                  <dd className="inline font-semibold tabular-nums">{formatoQ(t.abonado)}</dd>
                </div>
                <div className="text-slate-500">de {formatoQ(t.monto)}</div>
                <div>
                  <dt className="inline text-slate-500">Saldo </dt>
                  <dd className="inline font-medium tabular-nums">{formatoQ(Math.max(0, t.monto - t.abonado))}</dd>
                </div>
              </dl>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Los abonos y el estado se registran en cada presupuesto. El estado del trabajo se calcula solo a partir de sus presupuestos.
            </p>
          </Caja>
          <NotasTrabajo key={t.notas ?? ""} inicial={t.notas ?? ""} guardando={guardarNotas.isPending} onGuardar={(n) => guardarNotas.mutate(n)} />
          {guardarNotas.error && <Aviso>{guardarNotas.error.message}</Aviso>}
        </div>
      </div>
    </section>
  );
}

function NotasTrabajo({ inicial, guardando, onGuardar }: { inicial: string; guardando: boolean; onGuardar: (n: string) => void }) {
  const [notas, setNotas] = useState(inicial);
  return (
    <Caja titulo="Notas del trabajo">
      <textarea rows={4} maxLength={4000} className={claseInput} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Acuerdos, pendientes…" />
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
