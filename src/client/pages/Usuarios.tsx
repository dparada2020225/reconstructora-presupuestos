import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EstadoUsuario, type Usuario, type UsuarioAdmin } from "../api";

const etiqueta: Record<EstadoUsuario, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-amber-100 text-amber-900" },
  activo: { texto: "Con acceso", clase: "bg-emerald-100 text-emerald-900" },
  denegado: { texto: "Denegado", clase: "bg-slate-200 text-slate-700" },
};

/** Solo admin: autorizar o negar el acceso a quien entró a la app. */
export function Usuarios() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });
  const lista = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => api<UsuarioAdmin[]>("/usuarios"),
    enabled: me.data?.rol === "admin",
  });
  const cambiar = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: EstadoUsuario }) =>
      api(`/usuarios/${id}`, { method: "PATCH", body: JSON.stringify({ estado }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });

  if (me.data && me.data.rol !== "admin") return <p className="text-slate-600">Solo el administrador puede ver esta página.</p>;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="mt-1 text-slate-600">
          Quien entra por primera vez queda pendiente. Todos los autorizados tienen los mismos permisos.
        </p>
      </div>
      {lista.isLoading && <p className="text-slate-500">Cargando…</p>}
      {cambiar.error && <p className="text-sm text-red-700">{cambiar.error.message}</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {lista.data?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{u.email}</p>
              <p className="text-sm text-slate-500">
                {u.rol === "admin" ? "Administrador" : "Usuario"} · desde {new Date(u.creadoEn).toLocaleDateString("es-GT")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${etiqueta[u.estado].clase}`}>
                {etiqueta[u.estado].texto}
              </span>
              {u.id !== me.data?.id && u.estado !== "activo" && (
                <button
                  className="rounded-md bg-marca-700 px-3 py-1.5 text-sm text-white hover:bg-marca-600 disabled:opacity-50"
                  disabled={cambiar.isPending}
                  onClick={() => cambiar.mutate({ id: u.id, estado: "activo" })}
                >
                  Autorizar
                </button>
              )}
              {u.id !== me.data?.id && u.estado !== "denegado" && (
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
                  disabled={cambiar.isPending}
                  onClick={() => cambiar.mutate({ id: u.id, estado: "denegado" })}
                >
                  {u.estado === "activo" ? "Quitar acceso" : "Negar"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
