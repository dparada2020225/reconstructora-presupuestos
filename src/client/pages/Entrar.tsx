import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { api, enviar, type Usuario } from "../api";
import { Aviso, Boton, Campo, claseInput } from "../components/ui";

const ERRORES: Record<string, string> = {
  acceso: "No se pudo entrar con Google o con el código. Intenta de nuevo.",
  "con-clave": "Ese correo entra con contraseña: usa la opción de abajo.",
};

/**
 * /entrar — dos formas de entrar:
 *  1. Google o código al correo (Cloudflare Access protege /acceso y de ahí vuelve con la sesión abierta).
 *  2. Correo (o usuario) y contraseña, para quien el administrador le creó una.
 */
export function Entrar() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const entrar = useMutation({
    mutationFn: () => enviar("POST", "/sesion", { email, clave }),
    onSuccess: async () => {
      await qc.resetQueries();
      navegar("/", { replace: true });
    },
  });

  if (me.data) return <Navigate to="/" replace />;
  const errorUrl = ERRORES[params.get("error") ?? ""];

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-acento" aria-hidden />
            <span className="text-xl font-semibold tracking-tight text-marca-900">Reconstructora · Presupuestos</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">Entra para armar y ver los presupuestos.</p>
        </div>

        {errorUrl && <Aviso>{errorUrl}</Aviso>}

        <a
          href="/acceso"
          className="flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-900 shadow-sm hover:bg-slate-100"
        >
          Entrar con Google o con código al correo
        </a>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />o con contraseña<span className="h-px flex-1 bg-slate-200" />
        </div>

        <form
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            entrar.mutate();
          }}
        >
          <Campo etiqueta="Correo o usuario">
            <input className={claseInput} autoComplete="username" autoCapitalize="none" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Contraseña">
            <div className="flex gap-2">
              <input
                className={claseInput}
                type={ver ? "text" : "password"}
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required
              />
              <Boton type="button" onClick={() => setVer(!ver)} aria-pressed={ver} title={ver ? "Ocultar" : "Mostrar"}>
                {ver ? "Ocultar" : "Ver"}
              </Boton>
            </div>
          </Campo>
          {entrar.error && <Aviso>{entrar.error.message}</Aviso>}
          <Boton type="submit" variante="primario" className="w-full" disabled={entrar.isPending}>
            {entrar.isPending ? "Entrando…" : "Entrar"}
          </Boton>
          <p className="text-xs text-slate-500">¿Se te olvidó? Pídele al administrador que te ponga una nueva.</p>
        </form>
      </div>
    </div>
  );
}
