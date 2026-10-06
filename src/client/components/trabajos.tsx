import { Link } from "react-router";
import type { TrabajoResumen } from "../api";
import { ESTADO_TRABAJO, fechaCorta, formatoQ, Insignia } from "./ui";

const docs = (t: TrabajoResumen) => {
  const extras = t.presupuestos.filter((p) => p.tipo === "extra").length;
  return extras ? `Original + ${extras} ${extras === 1 ? "extra" : "extras"}` : "Original";
};

/** Trabajos de un cliente o de un bus, del más reciente al más viejo. */
export function TablaTrabajos({ trabajos, mostrar }: { trabajos: TrabajoResumen[]; mostrar: "cliente" | "bus" }) {
  if (!trabajos.length) return <p className="text-sm text-slate-500">Todavía no tiene trabajos.</p>;
  const total = trabajos.filter((t) => t.estado !== "no_concretado").reduce((a, t) => a + t.monto, 0);
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-4 py-2 font-medium">Fecha</th>
            <th className="px-2 py-2 font-medium">{mostrar === "cliente" ? "Cliente" : "Bus"}</th>
            <th className="px-2 py-2 font-medium">Presupuestos</th>
            <th className="px-2 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 text-right font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {trabajos.map((t) => (
            <tr key={t.id} className="border-b border-slate-100 last:border-0">
              <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fechaCorta(t.fecha)}</td>
              <td className="px-2 py-2">
                {mostrar === "cliente" ? (
                  <Link className="text-marca-700 hover:underline" to={`/clientes/${t.clienteId}`}>
                    {t.cliente}
                  </Link>
                ) : t.busId ? (
                  <Link className="text-marca-700 hover:underline" to={`/buses/${t.busId}`}>
                    {t.bus ?? t.placa}
                    {t.bus && t.placa && <span className="ml-1 text-xs text-slate-500">{t.placa}</span>}
                  </Link>
                ) : (
                  <span className="text-slate-400">Sin bus</span>
                )}
              </td>
              <td className="px-2 py-2">
                <Link className="text-marca-700 hover:underline" to={`/trabajos/${t.id}`}>
                  {docs(t)}
                </Link>
              </td>
              <td className="px-2 py-2">
                <Insignia clase={ESTADO_TRABAJO[t.estado].clase}>{ESTADO_TRABAJO[t.estado].texto}</Insignia>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                {formatoQ(t.monto)}
                {t.monto !== t.cotizado && <div className="text-xs text-slate-500">cotizado {formatoQ(t.cotizado)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-medium">
            <td className="px-4 py-2" colSpan={4}>
              {trabajos.length} {trabajos.length === 1 ? "trabajo" : "trabajos"}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{formatoQ(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
