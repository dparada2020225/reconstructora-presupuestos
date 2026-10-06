import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type Usuario } from "../api";

type Health = { ok: boolean; db: boolean };

export function Inicio() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido{me.data ? `, ${me.data.nombre}` : ""}</h1>
        <p className="mt-1 text-slate-600">Sistema de presupuestos de Reconstructora Antigua Jr.</p>
      </div>

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
