import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { nombreDocumento } from "../../shared/presupuesto";
import { api, ApiError, type PresupuestoFila, type Usuario } from "../api";
import { fechaCorta, formatoQ } from "../components/ui";

type Health = { ok: boolean; db: boolean };

export function Inicio() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });
  const presupuestos = useQuery({ queryKey: ["presupuestos"], queryFn: () => api<PresupuestoFila[]>("/presupuestos"), enabled: !!me.data });
  const borradores = presupuestos.data?.filter((p) => p.estado === "borrador") ?? [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido{me.data ? `, ${me.data.nombre}` : ""}</h1>
        <p className="mt-1 text-slate-600">Sistema de presupuestos de Reconstructora Antigua Jr.</p>
      </div>

      {me.data && (
        <div className="flex flex-wrap gap-3">
          <Link to="/presupuestos/nuevo" className="inline-flex items-center rounded-md bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600">
            + Nuevo presupuesto
          </Link>
          <Link to="/presupuestos" className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2.5 font-medium hover:bg-slate-100">
            Ver presupuestos
          </Link>
        </div>
      )}

      {borradores.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-4 py-2.5 font-medium">Borradores sin terminar</h2>
          <ul className="divide-y divide-slate-100">
            {borradores.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link to={`/presupuestos/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50">
                  <span>
                    <span className="font-medium text-marca-700">{p.cliente}</span>
                    <span className="ml-2 text-slate-500">
                      {nombreDocumento(p)} · {fechaCorta(p.fecha)}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatoQ(p.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Estado titulo="Servidor" ok={!health.isError} cargando={health.isLoading} />
        <Estado titulo="Base de datos" ok={health.data?.db === true} cargando={health.isLoading} />
      </div>

      {me.error instanceof ApiError && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {me.error.message === "pendiente"
            ? "Tu solicitud de acceso quedó registrada. Avísale al administrador para que la apruebe."
            : me.error.message === "denegado"
              ? "Tu acceso a la app fue denegado."
              : `No se pudo identificar al usuario (${me.error.message}).`}
        </p>
      )}
    </section>
  );
}

function Estado({ titulo, ok, cargando }: { titulo: string; ok: boolean; cargando: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className={`mt-1 font-medium ${cargando ? "text-slate-400" : ok ? "text-emerald-700" : "text-red-700"}`}>
        {cargando ? "Revisando…" : ok ? "Funcionando" : "Sin conexión"}
      </p>
    </div>
  );
}
