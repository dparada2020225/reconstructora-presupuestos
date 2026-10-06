import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, enviar, type ClienteDetalle, type ClienteFila } from "../api";
import { TablaTrabajos } from "../components/trabajos";
import { UnirCon } from "../components/unir";
import { Aviso, Boton, Caja, Campo, claseInput, Confirmar, Encabezado, fechaCorta } from "../components/ui";
import { NuevoBus } from "./Buses";

export function Cliente() {
  const id = Number(useParams().id);
  const detalle = useQuery({ queryKey: ["cliente", id], queryFn: () => api<ClienteDetalle>(`/clientes/${id}`) });
  const todos = useQuery({ queryKey: ["clientes"], queryFn: () => api<ClienteFila[]>("/clientes") });
  const [nuevoBus, setNuevoBus] = useState(false);
  const c = detalle.data;

  if (detalle.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (detalle.error || !c)
    return (
      <div className="space-y-3">
        <Encabezado titulo="Cliente" volver={{ to: "/clientes", texto: "Clientes" }} />
        <Aviso>{detalle.error?.message ?? "No encontrado"}</Aviso>
      </div>
    );

  const montoTotal = c.trabajos.filter((t) => t.estado !== "no_concretado").reduce((a, t) => a + t.monto, 0);

  return (
    <section className="space-y-4">
      <Encabezado
        titulo={c.nombre}
        volver={{ to: "/clientes", texto: "Clientes" }}
        detalle={
          c.trabajos.length
            ? `${c.trabajos.length} ${c.trabajos.length === 1 ? "trabajo" : "trabajos"} desde ${fechaCorta(c.trabajos.at(-1)?.fecha)} · Q${Math.round(montoTotal).toLocaleString("en-US")} en total`
            : "Sin trabajos todavía"
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Caja titulo="Datos">
            <FormCliente key={`${c.id}-${c.nombre}-${c.telefono}-${c.notas}`} cliente={c} />
            {c.alias.length > 1 && (
              <p className="mt-3 text-xs text-slate-500">
                También aparece escrito como: {c.alias.join(" · ")}
              </p>
            )}
          </Caja>

          <Caja
            titulo="Buses"
            accion={
              <Boton variante="texto" onClick={() => setNuevoBus(true)}>
                + Agregar bus
              </Boton>
            }
          >
            {c.buses.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {c.buses.map((b) => (
                  <li key={b.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <Link to={`/buses/${b.id}`} className="min-w-0 truncate text-marca-700 hover:underline">
                      {b.nombre ?? b.placa ?? "Sin nombre"}
                      {b.nombre && b.placa && <span className="ml-1.5 text-xs text-slate-500">{b.placa}</span>}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-500">
                      {b.trabajos} {b.trabajos === 1 ? "trabajo" : "trabajos"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Sin buses registrados.</p>
            )}
          </Caja>
        </div>

        <Caja titulo="Trabajos">
          <TablaTrabajos trabajos={c.trabajos} mostrar="bus" />
        </Caja>
      </div>

      <Caja titulo="Otras acciones">
        <div className="flex flex-wrap gap-2">
          <UnirCon
            tipo="clientes"
            sustantivo="cliente"
            este={c}
            opciones={(todos.data ?? []).map((o) => ({ id: o.id, etiqueta: o.nombre, detalle: `${o.trabajos} trab.`, buscarEn: o.alias.join(" ") }))}
          />
          <BorrarCliente cliente={c} />
        </div>
      </Caja>

      <NuevoBus abierto={nuevoBus} onCerrar={() => setNuevoBus(false)} clienteId={c.id} irAlCrear={false} />
    </section>
  );
}

function FormCliente({ cliente }: { cliente: ClienteDetalle }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ nombre: cliente.nombre, telefono: cliente.telefono ?? "", notas: cliente.notas ?? "" });
  const cambiado = d.nombre !== cliente.nombre || d.telefono !== (cliente.telefono ?? "") || d.notas !== (cliente.notas ?? "");
  const guardar = useMutation({
    mutationFn: () => enviar("PATCH", `/clientes/${cliente.id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cliente", cliente.id] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <Campo etiqueta="Nombre">
        <input required minLength={2} maxLength={120} className={claseInput} value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
      </Campo>
      <Campo etiqueta="Teléfono">
        <input maxLength={40} inputMode="tel" className={claseInput} value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
      </Campo>
      <Campo etiqueta="Notas">
        <textarea maxLength={1000} rows={3} className={claseInput} value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} />
      </Campo>
      {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
      {cambiado && (
        <div className="flex justify-end gap-2">
          <Boton onClick={() => setD({ nombre: cliente.nombre, telefono: cliente.telefono ?? "", notas: cliente.notas ?? "" })}>Deshacer</Boton>
          <Boton type="submit" variante="primario" disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar cambios"}
          </Boton>
        </div>
      )}
    </form>
  );
}

function BorrarCliente({ cliente }: { cliente: ClienteDetalle }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const borrar = useMutation({
    mutationFn: () => enviar("DELETE", `/clientes/${cliente.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      navegar("/clientes");
    },
  });
  const conTrabajos = cliente.trabajos.length > 0;
  return (
    <>
      <Boton
        variante="peligro"
        disabled={conTrabajos}
        title={conTrabajos ? "Tiene trabajos: si está repetido, únelo con el otro cliente" : undefined}
        onClick={() => (borrar.reset(), setAbierto(true))}
      >
        Borrar cliente
      </Boton>
      {conTrabajos && <p className="w-full text-xs text-slate-500">Un cliente con trabajos no se puede borrar; si está repetido, únelo con el otro.</p>}
      <Confirmar
        abierto={abierto}
        titulo="¿Borrar cliente?"
        textoBoton="Sí, borrar"
        peligro
        ocupado={borrar.isPending}
        error={borrar.error?.message}
        onCerrar={() => setAbierto(false)}
        onConfirmar={() => borrar.mutate()}
      >
        <p>
          Se borra <b>{cliente.nombre}</b>.{cliente.buses.length > 0 && " Sus buses quedan registrados, pero sin cliente."}
        </p>
      </Confirmar>
    </>
  );
}
