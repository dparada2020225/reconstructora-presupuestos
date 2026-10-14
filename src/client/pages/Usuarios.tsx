import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CLAVE_MIN } from "../../shared/clave";
import { api, enviar, type EstadoUsuario, type Usuario, type UsuarioAdmin } from "../api";
import { Aviso, Boton, Campo, claseInput, Confirmar, Dialogo } from "../components/ui";

const etiqueta: Record<EstadoUsuario, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-amber-100 text-amber-900" },
  activo: { texto: "Con acceso", clase: "bg-emerald-100 text-emerald-900" },
  denegado: { texto: "Denegado", clase: "bg-slate-200 text-slate-700" },
};

/** Solo admin: autorizar o negar el acceso, y manejar los usuarios que entran con contraseña. */
export function Usuarios() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });
  const lista = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => api<UsuarioAdmin[]>("/usuarios"),
    enabled: me.data?.rol === "admin",
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });
  const cambiar = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: EstadoUsuario }) => enviar("PATCH", `/usuarios/${id}`, { estado }),
    onSuccess: refrescar,
  });
  const quitarClave = useMutation({
    mutationFn: (id: number) => enviar("DELETE", `/usuarios/${id}/clave`),
    onSuccess: () => (refrescar(), setQuitando(null)),
  });
  const [nuevo, setNuevo] = useState(false);
  const [poniendo, setPoniendo] = useState<UsuarioAdmin | null>(null);
  const [quitando, setQuitando] = useState<UsuarioAdmin | null>(null);

  if (me.data && me.data.rol !== "admin") return <p className="text-slate-600">Solo el administrador puede ver esta página.</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-slate-600">
            Quien entra con Google o código queda pendiente hasta que lo autorices. A quien no tiene cómo, créale un usuario con contraseña.
            Todos los autorizados tienen los mismos permisos.
          </p>
        </div>
        <Boton variante="primario" onClick={() => setNuevo(true)}>
          + Usuario con contraseña
        </Boton>
      </div>
      {lista.isLoading && <p className="text-slate-500">Cargando…</p>}
      {cambiar.error && <Aviso>{cambiar.error.message}</Aviso>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {lista.data?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {u.nombre} <span className="font-normal text-slate-500">· {u.email}</span>
              </p>
              <p className="text-sm text-slate-500">
                {u.rol === "admin" ? "Administrador" : "Usuario"} · {u.conClave ? "entra con contraseña" : "entra con Google o código"} · desde{" "}
                {new Date(u.creadoEn).toLocaleDateString("es-GT")}
              </p>
              {u.bloqueadoHasta && (
                <p className="text-sm text-red-700">
                  Bloqueado por intentos fallidos hasta las {new Date(u.bloqueadoHasta).toLocaleTimeString("es-GT", { hour: "numeric", minute: "2-digit" })}. Ponerle
                  contraseña lo desbloquea.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${etiqueta[u.estado].clase}`}>{etiqueta[u.estado].texto}</span>
              <Boton variante="texto" onClick={() => setPoniendo(u)}>
                {u.conClave ? "Cambiar contraseña" : "Poner contraseña"}
              </Boton>
              {u.conClave && (
                <Boton variante="texto" onClick={() => (quitarClave.reset(), setQuitando(u))}>
                  Quitar contraseña
                </Boton>
              )}
              {u.id !== me.data?.id && u.estado !== "activo" && (
                <Boton variante="primario" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: u.id, estado: "activo" })}>
                  Autorizar
                </Boton>
              )}
              {u.id !== me.data?.id && u.estado !== "denegado" && (
                <Boton disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: u.id, estado: "denegado" })}>
                  {u.estado === "activo" ? "Quitar acceso" : "Negar"}
                </Boton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Las contraseñas no se pueden ver (solo se guarda una huella cifrada). Si alguien la olvida, ponle una nueva con “Cambiar contraseña”.
      </p>

      <Dialogo abierto={nuevo} onCerrar={() => setNuevo(false)} titulo="Usuario con contraseña">
        <FormNuevo
          onListo={() => {
            setNuevo(false);
            refrescar();
          }}
        />
      </Dialogo>
      <Dialogo abierto={!!poniendo} onCerrar={() => setPoniendo(null)} titulo={poniendo?.conClave ? "Cambiar contraseña" : "Poner contraseña"}>
        {poniendo && (
          <FormClave
            usuario={poniendo}
            onListo={() => {
              setPoniendo(null);
              refrescar();
            }}
          />
        )}
      </Dialogo>
      <Confirmar
        abierto={!!quitando}
        titulo="Quitar contraseña"
        textoBoton="Quitar contraseña"
        peligro
        ocupado={quitarClave.isPending}
        error={quitarClave.error?.message}
        onConfirmar={() => quitando && quitarClave.mutate(quitando.id)}
        onCerrar={() => setQuitando(null)}
      >
        <p>
          <b>{quitando?.nombre}</b> ya no podrá entrar con contraseña; solo con Google o con el código a <b>{quitando?.email}</b> (si ese correo es suyo).
        </p>
      </Confirmar>
    </section>
  );
}

function CampoClave({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [ver, setVer] = useState(false);
  return (
    <Campo etiqueta="Contraseña" ayuda={`Mínimo ${CLAVE_MIN} caracteres. Anótala y dásela a la persona: después no se puede ver.`}>
      <div className="flex gap-2">
        <input className={claseInput} type={ver ? "text" : "password"} autoComplete="new-password" value={valor} onChange={(e) => onChange(e.target.value)} />
        <Boton type="button" onClick={() => setVer(!ver)} aria-pressed={ver}>
          {ver ? "Ocultar" : "Ver"}
        </Boton>
      </div>
    </Campo>
  );
}

function FormNuevo({ onListo }: { onListo: () => void }) {
  const [d, setD] = useState({ nombre: "", email: "", clave: "" });
  const crear = useMutation({ mutationFn: () => enviar("POST", "/usuarios", d), onSuccess: onListo });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
    >
      <Campo etiqueta="Nombre">
        <input className={claseInput} maxLength={80} value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
      </Campo>
      <Campo etiqueta="Correo o usuario" ayuda="Con esto entra. Puede ser un correo o algo simple como “nelson”.">
        <input className={claseInput} maxLength={120} autoCapitalize="none" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
      </Campo>
      <CampoClave valor={d.clave} onChange={(clave) => setD({ ...d, clave })} />
      <p className="text-xs text-slate-500">Queda autorizado de una vez y solo puede entrar con esta contraseña.</p>
      {crear.error && <Aviso>{crear.error.message}</Aviso>}
      <div className="flex justify-end">
        <Boton type="submit" variante="primario" disabled={crear.isPending}>
          {crear.isPending ? "Creando…" : "Crear usuario"}
        </Boton>
      </div>
    </form>
  );
}

function FormClave({ usuario, onListo }: { usuario: UsuarioAdmin; onListo: () => void }) {
  const [clave, setClave] = useState("");
  const guardar = useMutation({ mutationFn: () => enviar("PUT", `/usuarios/${usuario.id}/clave`, { clave }), onSuccess: onListo });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <p className="text-sm text-slate-600">
        <b>{usuario.nombre}</b> ({usuario.email}) {usuario.conClave ? "dejará de entrar con la contraseña anterior y se le cerrará la sesión." : "podrá entrar con correo y contraseña, y ya no con Google o código."}
      </p>
      <CampoClave valor={clave} onChange={setClave} />
      {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
      <div className="flex justify-end">
        <Boton type="submit" variante="primario" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar contraseña"}
        </Boton>
      </div>
    </form>
  );
}
