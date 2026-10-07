import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ESTADOS_PRESUPUESTO, FORMAS_PAGO, porcentajeAbonado, type EstadoPresupuesto, type FormaPago } from "../../shared/estados";
import { hoyGuatemala } from "../../shared/presupuesto";
import { api, enviar, type Pago, type TrabajoDetalle } from "../api";
import { Aro, Aviso, Boton, Caja, Campo, claseInput, Confirmar, ESTADO_PRESUPUESTO, fechaCorta, FORMA_PAGO, formatoQ } from "../components/ui";
import { aNumero } from "./modelo";

const INVALIDAR = ["presupuesto", "presupuestos", "trabajo", "cliente", "bus", "estadisticas"];

/** Estado propio de cada presupuesto (original o extra). */
export function EstadoPresupuestoCaja({ id, estado, guardarAntes }: { id: number; estado: EstadoPresupuesto; guardarAntes: () => Promise<number | null> }) {
  const qc = useQueryClient();
  const cambiar = useMutation({
    mutationFn: async (nuevo: EstadoPresupuesto) => {
      // Si hay cambios sin guardar, primero se guardan.
      if (!(await guardarAntes())) throw new Error("Revisa el presupuesto antes de cambiar el estado.");
      await enviar("PATCH", `/presupuestos/${id}/estado`, { estado: nuevo });
    },
    onSuccess: () => INVALIDAR.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
  return (
    <Caja titulo="Estado de este presupuesto">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estado del presupuesto">
        {ESTADOS_PRESUPUESTO.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={estado === k}
            disabled={cambiar.isPending}
            onClick={() => estado !== k && cambiar.mutate(k)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
              estado === k ? `border-transparent ${ESTADO_PRESUPUESTO[k].clase} ring-2 ring-offset-1 ring-slate-300` : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {ESTADO_PRESUPUESTO[k].texto}
          </button>
        ))}
      </div>
      {cambiar.error && <div className="mt-2"><Aviso>{cambiar.error.message}</Aviso></div>}
    </Caja>
  );
}

/**
 * Abonos de TODO el trabajo (original + extras): aro con el % abonado del total del trabajo,
 * lista y formulario para registrar, editar o borrar. No salen en el PDF.
 */
export function AbonosTrabajo({ trabajoId, monto }: { trabajoId: number; monto: number }) {
  const qc = useQueryClient();
  const trabajo = useQuery({ queryKey: ["trabajo", trabajoId], queryFn: () => api<TrabajoDetalle>(`/trabajos/${trabajoId}`) });
  const refrescar = () => INVALIDAR.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const [editando, setEditando] = useState<Pago | "nuevo" | null>(null);
  const [quitarPago, setQuitarPago] = useState<Pago | null>(null);
  const pagos = trabajo.data?.pagos ?? [];
  const abonado = pagos.reduce((a, p) => a + p.monto, 0);
  const saldo = monto - abonado;

  const borrar = useMutation({
    mutationFn: (p: Pago) => enviar("DELETE", `/trabajos/${trabajoId}/pagos/${p.id}`),
    onSuccess: () => {
      setQuitarPago(null);
      refrescar();
    },
  });

  return (
    <div>
      <div className="flex items-center gap-4">
        <Aro valor={porcentajeAbonado(abonado, monto)} etiqueta="Abonado del trabajo" />
        <dl className="min-w-0 space-y-0.5 text-sm">
          <div>
            <dt className="inline text-slate-500">Abonado </dt>
            <dd className="inline font-semibold tabular-nums">{formatoQ(abonado)}</dd>
          </div>
          <div className="text-slate-500">
            de <span className="tabular-nums">{formatoQ(monto)}</span>
          </div>
          <div>
            <dt className="inline text-slate-500">{saldo < 0 ? "Pagado de más " : "Saldo "}</dt>
            <dd className={`inline font-medium tabular-nums ${saldo <= 0 ? "text-emerald-700" : ""}`}>{formatoQ(Math.abs(saldo))}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">Abonos del trabajo</p>
          {editando === null && (
            <Boton variante="texto" onClick={() => setEditando("nuevo")}>
              + Registrar abono
            </Boton>
          )}
        </div>
        {trabajo.isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
        {pagos.length > 0 && (
          <ul className="mt-1 divide-y divide-slate-100 text-sm">
            {pagos.map((p) =>
              editando !== "nuevo" && editando?.id === p.id ? (
                <li key={p.id} className="py-1.5">
                  <FormPago trabajoId={trabajoId} saldo={saldo} pago={p} onListo={() => (setEditando(null), refrescar())} onCancelar={() => setEditando(null)} />
                </li>
              ) : (
                <li key={p.id} className="flex items-start justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <p className="tabular-nums">
                      {formatoQ(p.monto)} <span className="text-xs text-slate-500">· {p.forma ? FORMA_PAGO[p.forma] : "Sin forma de pago"}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {fechaCorta(p.fecha)}
                      {p.nota && ` · ${p.nota}`}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Editar abono" title="Editar" onClick={() => setEditando(p)}>
                      ✎
                    </button>
                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-700" aria-label="Borrar abono" title="Borrar" onClick={() => (borrar.reset(), setQuitarPago(p))}>
                      ✕
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
        {!pagos.length && !trabajo.isLoading && editando === null && <p className="mt-1 text-sm text-slate-500">Todavía no hay abonos.</p>}
        {editando === "nuevo" && <FormPago trabajoId={trabajoId} saldo={saldo} onListo={() => (setEditando(null), refrescar())} onCancelar={() => setEditando(null)} />}
        <p className="mt-2 text-xs text-slate-500">Los abonos son de todo el trabajo y no salen en el PDF.</p>
      </div>

      <Confirmar
        abierto={!!quitarPago}
        titulo="¿Borrar este abono?"
        textoBoton="Sí, borrar"
        peligro
        ocupado={borrar.isPending}
        error={borrar.error?.message}
        onCerrar={() => setQuitarPago(null)}
        onConfirmar={() => quitarPago && borrar.mutate(quitarPago)}
      >
        {quitarPago && (
          <p>
            Abono de <b>{formatoQ(quitarPago.monto)}</b> del {fechaCorta(quitarPago.fecha)}.
          </p>
        )}
      </Confirmar>
    </div>
  );
}

function FormPago({ trabajoId, saldo, pago, onListo, onCancelar }: { trabajoId: number; saldo: number; pago?: Pago; onListo: () => void; onCancelar: () => void }) {
  const [d, setD] = useState({
    fecha: pago?.fecha ?? hoyGuatemala(),
    monto: pago ? String(pago.monto) : "",
    forma: (pago?.forma ?? "efectivo") as FormaPago,
    nota: pago?.nota ?? "",
  });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { fecha: d.fecha, monto: aNumero(d.monto) ?? 0, forma: d.forma, nota: d.nota };
      return pago ? enviar("PATCH", `/trabajos/${trabajoId}/pagos/${pago.id}`, cuerpo) : enviar("POST", `/trabajos/${trabajoId}/pagos`, cuerpo);
    },
    onSuccess: onListo,
  });
  return (
    <form
      className="mt-2 space-y-2 rounded-md bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Monto">
          <input
            required
            inputMode="decimal"
            autoFocus
            className={`${claseInput} text-right tabular-nums`}
            placeholder={saldo > 0 ? String(Math.round(saldo * 100) / 100) : "Q"}
            value={d.monto}
            onChange={(e) => setD({ ...d, monto: e.target.value })}
          />
        </Campo>
        <Campo etiqueta="Fecha">
          <input required type="date" className={claseInput} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
        </Campo>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-slate-600">Forma de pago</legend>
        <div className="flex flex-wrap gap-1.5">
          {FORMAS_PAGO.map((f) => (
            <label key={f} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${d.forma === f ? "border-marca-600 bg-marca-50 font-medium text-marca-900" : "border-slate-200 bg-white text-slate-600"}`}>
              <input type="radio" name={`forma-${pago?.id ?? "nuevo"}`} className="sr-only" checked={d.forma === f} onChange={() => setD({ ...d, forma: f })} />
              {FORMA_PAGO[f]}
            </label>
          ))}
        </div>
      </fieldset>
      <Campo etiqueta="Nota (opcional)">
        <input maxLength={300} className={claseInput} placeholder="No. de cheque, banco, quién pagó…" value={d.nota} onChange={(e) => setD({ ...d, nota: e.target.value })} />
      </Campo>
      {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
      <div className="flex justify-end gap-2">
        <Boton onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" disabled={guardar.isPending || !aNumero(d.monto)}>
          {guardar.isPending ? "Guardando…" : pago ? "Guardar cambios" : "Guardar abono"}
        </Boton>
      </div>
    </form>
  );
}
