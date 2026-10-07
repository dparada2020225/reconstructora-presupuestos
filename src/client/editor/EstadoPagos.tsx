import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ESTADOS_PRESUPUESTO, FORMAS_PAGO, porcentajeAbonado, type EstadoPresupuesto, type FormaPago } from "../../shared/estados";
import { hoyGuatemala } from "../../shared/presupuesto";
import { enviar, type Pago } from "../api";
import { Aro, Aviso, Boton, Caja, Campo, claseInput, Confirmar, ESTADO_PRESUPUESTO, fechaCorta, FORMA_PAGO, formatoQ } from "../components/ui";
import { aNumero } from "./modelo";

const INVALIDAR = ["presupuesto", "presupuestos", "trabajo", "cliente", "bus", "estadisticas"];

/**
 * Aro con el % abonado, estado del presupuesto y registro de abonos.
 * Los abonos no salen en el PDF: su suma es el ANTICIPO que sí sale.
 */
export function EstadoPagos({
  id,
  estado,
  pagos,
  monto,
  guardarAntes,
}: {
  id: number;
  estado: EstadoPresupuesto;
  pagos: Pago[];
  /** Lo que se cobra: "cerrado en" o el total. */
  monto: number;
  guardarAntes: () => Promise<number | null>;
}) {
  const qc = useQueryClient();
  const refrescar = () => INVALIDAR.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const [formAbierto, setFormAbierto] = useState(false);
  const [quitarPago, setQuitarPago] = useState<Pago | null>(null);
  const abonado = pagos.reduce((a, p) => a + p.monto, 0);
  const saldo = monto - abonado;

  const cambiarEstado = useMutation({
    mutationFn: async (nuevo: EstadoPresupuesto) => {
      // Si hay cambios sin guardar, primero se guardan.
      if (!(await guardarAntes())) throw new Error("Revisa el presupuesto antes de cambiar el estado.");
      await enviar("PATCH", `/presupuestos/${id}/estado`, { estado: nuevo });
    },
    onSuccess: refrescar,
  });
  const borrarPago = useMutation({
    mutationFn: (p: Pago) => enviar("DELETE", `/presupuestos/${id}/pagos/${p.id}`),
    onSuccess: () => {
      setQuitarPago(null);
      refrescar();
    },
  });

  return (
    <Caja titulo="Estado y abonos">
      <div className="flex items-center gap-4">
        <Aro valor={porcentajeAbonado(abonado, monto)} etiqueta="Abonado" />
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

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-slate-600">Estado del presupuesto</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estado del presupuesto">
          {ESTADOS_PRESUPUESTO.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={estado === k}
              disabled={cambiarEstado.isPending}
              onClick={() => estado !== k && cambiarEstado.mutate(k)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                estado === k ? `border-transparent ${ESTADO_PRESUPUESTO[k].clase} ring-2 ring-offset-1 ring-slate-300` : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {ESTADO_PRESUPUESTO[k].texto}
            </button>
          ))}
        </div>
        {cambiarEstado.error && <div className="mt-2"><Aviso>{cambiarEstado.error.message}</Aviso></div>}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">Abonos</p>
          {!formAbierto && (
            <Boton variante="texto" onClick={() => setFormAbierto(true)}>
              + Registrar abono
            </Boton>
          )}
        </div>
        {pagos.length ? (
          <ul className="mt-1 divide-y divide-slate-100 text-sm">
            {pagos.map((p) => (
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
                <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-700" aria-label="Borrar abono" onClick={() => (borrarPago.reset(), setQuitarPago(p))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !formAbierto && <p className="mt-1 text-sm text-slate-500">Todavía no hay abonos.</p>
        )}
        {formAbierto && <NuevoPago id={id} saldo={saldo} onListo={() => (setFormAbierto(false), refrescar())} onCancelar={() => setFormAbierto(false)} />}
      </div>

      <Confirmar
        abierto={!!quitarPago}
        titulo="¿Borrar este abono?"
        textoBoton="Sí, borrar"
        peligro
        ocupado={borrarPago.isPending}
        error={borrarPago.error?.message}
        onCerrar={() => setQuitarPago(null)}
        onConfirmar={() => quitarPago && borrarPago.mutate(quitarPago)}
      >
        {quitarPago && (
          <p>
            Abono de <b>{formatoQ(quitarPago.monto)}</b> del {fechaCorta(quitarPago.fecha)}. El anticipo del PDF se recalcula.
          </p>
        )}
      </Confirmar>
    </Caja>
  );
}

function NuevoPago({ id, saldo, onListo, onCancelar }: { id: number; saldo: number; onListo: () => void; onCancelar: () => void }) {
  const [d, setD] = useState({ fecha: hoyGuatemala(), monto: "", forma: "efectivo" as FormaPago, nota: "" });
  const crear = useMutation({
    mutationFn: () => enviar("POST", `/presupuestos/${id}/pagos`, { fecha: d.fecha, monto: aNumero(d.monto) ?? 0, forma: d.forma, nota: d.nota }),
    onSuccess: onListo,
  });
  return (
    <form
      className="mt-2 space-y-2 rounded-md bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Monto">
          <input required inputMode="decimal" autoFocus className={`${claseInput} text-right tabular-nums`} placeholder={saldo > 0 ? String(Math.round(saldo * 100) / 100) : "Q"} value={d.monto} onChange={(e) => setD({ ...d, monto: e.target.value })} />
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
              <input type="radio" name="forma" className="sr-only" checked={d.forma === f} onChange={() => setD({ ...d, forma: f })} />
              {FORMA_PAGO[f]}
            </label>
          ))}
        </div>
      </fieldset>
      <Campo etiqueta="Nota (opcional)">
        <input maxLength={300} className={claseInput} placeholder="No. de cheque, banco, quién pagó…" value={d.nota} onChange={(e) => setD({ ...d, nota: e.target.value })} />
      </Campo>
      {crear.error && <Aviso>{crear.error.message}</Aviso>}
      <div className="flex justify-end gap-2">
        <Boton onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" disabled={crear.isPending || !aNumero(d.monto)}>
          {crear.isPending ? "Guardando…" : "Guardar abono"}
        </Boton>
      </div>
    </form>
  );
}
