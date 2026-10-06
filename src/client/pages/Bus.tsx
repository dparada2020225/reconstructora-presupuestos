import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, enviar, type BusDetalle, type BusFila } from "../api";
import { TablaTrabajos } from "../components/trabajos";
import { UnirCon } from "../components/unir";
import { Aviso, Boton, Caja, Campo, claseInput, ComboBusqueda, Confirmar, Encabezado } from "../components/ui";
import { nombreBus, useOpcionesClientes } from "./Buses";

export function Bus() {
  const id = Number(useParams().id);
  const detalle = useQuery({ queryKey: ["bus", id], queryFn: () => api<BusDetalle>(`/buses/${id}`) });
  const todos = useQuery({ queryKey: ["buses"], queryFn: () => api<BusFila[]>("/buses") });
  const b = detalle.data;

  if (detalle.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (detalle.error || !b)
    return (
      <div className="space-y-3">
        <Encabezado titulo="Bus" volver={{ to: "/buses", texto: "Buses" }} />
        <Aviso>{detalle.error?.message ?? "No encontrado"}</Aviso>
      </div>
    );

  return (
    <section className="space-y-4">
      <Encabezado
        titulo={
          <>
            {nombreBus(b)}
            {b.nombre && b.placa && <span className="ml-2 font-mono text-base font-normal text-slate-500">{b.placa}</span>}
          </>
        }
        volver={{ to: "/buses", texto: "Buses" }}
        detalle={
          b.clienteId ? (
            <>
              de{" "}
              <Link className="text-marca-700 hover:underline" to={`/clientes/${b.clienteId}`}>
                {b.cliente}
              </Link>
            </>
          ) : (
            "Sin cliente"
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Caja titulo="Datos">
          <FormBus key={JSON.stringify([b.clienteId, b.placa, b.nombre, b.descripcion, b.notas])} bus={b} />
        </Caja>
        <Caja titulo="Trabajos">
          <TablaTrabajos trabajos={b.trabajos} mostrar="cliente" />
        </Caja>
      </div>

      <Caja titulo="Otras acciones">
        <div className="flex flex-wrap gap-2">
          <UnirCon
            tipo="buses"
            sustantivo="bus"
            este={{ id: b.id, nombre: nombreBus(b) }}
            opciones={(todos.data ?? []).map((o) => ({
              id: o.id,
              etiqueta: nombreBus(o),
              detalle: [o.placa !== nombreBus(o) ? o.placa : null, o.cliente].filter(Boolean).join(" · "),
              buscarEn: `${o.placa ?? ""} ${o.cliente ?? ""}`,
            }))}
          />
          <BorrarBus bus={b} />
        </div>
      </Caja>
    </section>
  );
}

function FormBus({ bus }: { bus: BusDetalle }) {
  const qc = useQueryClient();
  const opciones = useOpcionesClientes();
  const inicial = { clienteId: bus.clienteId, placa: bus.placa ?? "", nombre: bus.nombre ?? "", descripcion: bus.descripcion ?? "", notas: bus.notas ?? "" };
  const [d, setD] = useState(inicial);
  const cambiado = JSON.stringify(d) !== JSON.stringify(inicial);
  const guardar = useMutation({
    mutationFn: () => enviar("PATCH", `/buses/${bus.id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bus", bus.id] });
      qc.invalidateQueries({ queryKey: ["buses"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["cliente"] });
    },
  });
  const campo = (k: "placa" | "nombre" | "descripcion" | "notas") => ({
    value: d[k],
    onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <Campo etiqueta="Cliente">
        <ComboBusqueda opciones={opciones} valor={d.clienteId} onChange={(clienteId) => setD({ ...d, clienteId })} sinValor="Sin cliente" placeholder="Buscar cliente…" />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Placa">
          <input maxLength={20} className={`${claseInput} uppercase`} placeholder="C-123ABC" {...campo("placa")} />
        </Campo>
        <Campo etiqueta="Nombre">
          <input maxLength={80} className={claseInput} {...campo("nombre")} />
        </Campo>
      </div>
      <Campo etiqueta="Descripción">
        <input maxLength={200} className={claseInput} {...campo("descripcion")} />
      </Campo>
      <Campo etiqueta="Notas">
        <textarea maxLength={1000} rows={3} className={claseInput} {...campo("notas")} />
      </Campo>
      {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
      {cambiado && (
        <div className="flex justify-end gap-2">
          <Boton onClick={() => setD(inicial)}>Deshacer</Boton>
          <Boton type="submit" variante="primario" disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar cambios"}
          </Boton>
        </div>
      )}
    </form>
  );
}

function BorrarBus({ bus }: { bus: BusDetalle }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const borrar = useMutation({
    mutationFn: () => enviar("DELETE", `/buses/${bus.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buses"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      navegar("/buses");
    },
  });
  const conTrabajos = bus.trabajos.length > 0;
  return (
    <>
      <Boton variante="peligro" disabled={conTrabajos} onClick={() => (borrar.reset(), setAbierto(true))}>
        Borrar bus
      </Boton>
      {conTrabajos && <p className="w-full text-xs text-slate-500">Un bus con trabajos no se puede borrar; si está repetido, únelo con el otro.</p>}
      <Confirmar
        abierto={abierto}
        titulo="¿Borrar bus?"
        textoBoton="Sí, borrar"
        peligro
        ocupado={borrar.isPending}
        error={borrar.error?.message}
        onCerrar={() => setAbierto(false)}
        onConfirmar={() => borrar.mutate()}
      >
        <p>
          Se borra <b>{nombreBus(bus)}</b>.
        </p>
      </Confirmar>
    </>
  );
}
