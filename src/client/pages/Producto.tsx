import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, enviar, type ProductoDetalle, type ProductoFila } from "../api";
import { Linea } from "../components/graficas";
import { UnirCon } from "../components/unir";
import { Aviso, Boton, Caja, Campo, claseInput, Confirmar, Encabezado, fechaCorta, formatoQ, Insignia } from "../components/ui";
import { useCategorias } from "./Productos";

export function Producto() {
  const id = Number(useParams().id);
  const detalle = useQuery({ queryKey: ["producto", id], queryFn: () => api<ProductoDetalle>(`/productos/${id}`) });
  const todos = useQuery({ queryKey: ["productos"], queryFn: () => api<ProductoFila[]>("/productos") });
  const [verTodos, setVerTodos] = useState(false);
  const p = detalle.data;

  if (detalle.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (detalle.error || !p)
    return (
      <div className="space-y-3">
        <Encabezado titulo="Producto" volver={{ to: "/productos", texto: "Productos" }} />
        <Aviso>{detalle.error?.message ?? "No encontrado"}</Aviso>
      </div>
    );

  const ultimo = p.usos.find((u) => u.unitario !== null) ?? null;
  const ultimoAnio = p.porAnio.at(-1);
  const usos = verTodos ? p.usos : p.usos.slice(0, 15);

  return (
    <section className="space-y-4">
      <Encabezado
        titulo={
          <>
            {p.nombre}
            {!p.activo && <Insignia clase="ml-3 align-middle bg-slate-200 text-slate-600">Desactivado</Insignia>}
          </>
        }
        volver={{ to: "/productos", texto: "Productos" }}
        detalle={p.categoria ?? "Sin categoría"}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Dato etiqueta="Veces cotizado" valor={String(p.veces)} detalle={p.usos.length ? `desde ${fechaCorta(p.usos.at(-1)?.fecha)}` : "nunca"} />
        <Dato
          etiqueta="Último precio"
          valor={ultimo?.unitario != null ? formatoQ(ultimo.unitario) : "—"}
          detalle={ultimo ? `${fechaCorta(ultimo.fecha)} · ${ultimo.cliente}` : undefined}
        />
        <Dato
          etiqueta={`Precio típico ${ultimoAnio?.anio ?? ""}`}
          valor={ultimoAnio ? formatoQ(ultimoAnio.mediana) : "—"}
          detalle={ultimoAnio ? `mediana de ${ultimoAnio.n} ${ultimoAnio.n === 1 ? "vez" : "veces"}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Caja titulo="Datos del catálogo">
          <FormProducto key={JSON.stringify([p.nombre, p.categoria, p.precioReferencia, p.unidad, p.notas])} producto={p} ultimoPrecio={ultimo?.unitario ?? null} />
          {p.alias.length > 1 && <p className="mt-3 text-xs text-slate-500">También se reconoce como: {p.alias.join(" · ")}</p>}
        </Caja>

        <Caja titulo="Cómo ha cambiado el precio">
          {p.porAnio.length > 1 ? (
            <>
              <Linea
                titulo={`Precio típico de ${p.nombre} por año`}
                datos={p.porAnio.map((a) => ({ etiqueta: a.anio, valor: a.mediana, detalle: `${a.anio} · mediana de ${a.n} ${a.n === 1 ? "vez" : "veces"}` }))}
                formato={(n) => `Q${Math.round(n).toLocaleString("en-US")}`}
              />
              <p className="mt-1 text-xs text-slate-500">Precio por unidad (mediana) en cada año.</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Hace falta que se haya cotizado en al menos dos años distintos para ver la evolución.</p>
          )}
        </Caja>
      </div>

      <Caja titulo={`Veces que se cotizó${p.veces > p.usos.length ? ` (últimas ${p.usos.length})` : ""}`}>
        {p.usos.length ? (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-2 py-2 font-medium">Cliente</th>
                  <th className="px-2 py-2 font-medium">Cómo se escribió</th>
                  <th className="px-2 py-2 text-right font-medium">Cant.</th>
                  <th className="px-2 py-2 text-right font-medium">Por unidad</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {usos.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-1.5 tabular-nums">{fechaCorta(u.fecha)}</td>
                    <td className="px-2 py-1.5">
                      <Link className="text-marca-700 hover:underline" to={`/clientes/${u.clienteId}`}>
                        {u.cliente}
                      </Link>
                      {u.tipo === "extra" && <span className="ml-1.5 text-xs text-slate-500">(extra)</span>}
                    </td>
                    <td className="px-2 py-1.5 text-slate-700">{u.descripcion}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{u.cantidad}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{u.unitario !== null ? formatoQ(u.unitario) : "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{u.precio !== null ? formatoQ(u.precio) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.usos.length > 15 && (
              <div className="px-4 pt-2">
                <Boton variante="texto" onClick={() => setVerTodos((v) => !v)}>
                  {verTodos ? "Ver menos" : `Ver todas (${p.usos.length})`}
                </Boton>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Todavía no aparece en ningún presupuesto.</p>
        )}
      </Caja>

      <Caja titulo="Otras acciones">
        <div className="flex flex-wrap gap-2">
          <UnirCon
            tipo="productos"
            sustantivo="producto"
            este={p}
            opciones={(todos.data ?? []).map((o) => ({ id: o.id, etiqueta: o.nombre, detalle: `${o.veces} veces`, buscarEn: o.alias.join(" ") }))}
          />
          <ActivarOBorrar producto={p} />
        </div>
      </Caja>
    </section>
  );
}

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{valor}</p>
      {detalle && <p className="mt-0.5 truncate text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

function FormProducto({ producto, ultimoPrecio }: { producto: ProductoDetalle; ultimoPrecio: number | null }) {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["productos"], queryFn: () => api<ProductoFila[]>("/productos") });
  const categorias = useCategorias(lista.data);
  const inicial = {
    nombre: producto.nombre,
    categoria: producto.categoria ?? "",
    precioReferencia: producto.precioReferencia === null ? "" : String(producto.precioReferencia),
    unidad: producto.unidad ?? "",
    notas: producto.notas ?? "",
  };
  const [d, setD] = useState(inicial);
  const cambiado = JSON.stringify(d) !== JSON.stringify(inicial);
  const guardar = useMutation({
    mutationFn: () =>
      enviar("PATCH", `/productos/${producto.id}`, {
        ...d,
        precioReferencia: d.precioReferencia.trim() === "" ? null : Number(d.precioReferencia),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["producto", producto.id] });
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
  });
  const campo = (k: keyof typeof inicial) => ({
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
      <Campo etiqueta="Nombre">
        <input required minLength={2} maxLength={160} className={claseInput} {...campo("nombre")} />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Categoría">
          <input list="categorias-producto" maxLength={40} className={`${claseInput} uppercase`} {...campo("categoria")} />
          <datalist id="categorias-producto">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo etiqueta="Unidad">
          <input maxLength={30} className={claseInput} placeholder="unidad, par, juego…" {...campo("unidad")} />
        </Campo>
      </div>
      <Campo
        etiqueta="Precio de referencia (por unidad)"
        ayuda={
          ultimoPrecio !== null && Number(d.precioReferencia) !== ultimoPrecio ? (
            <button type="button" className="text-marca-700 hover:underline" onClick={() => setD({ ...d, precioReferencia: String(ultimoPrecio) })}>
              Usar el último precio ({formatoQ(ultimoPrecio)})
            </button>
          ) : (
            "Es el que se sugerirá al armar un presupuesto."
          )
        }
      >
        <input type="number" min={0} step="0.01" inputMode="decimal" className={claseInput} {...campo("precioReferencia")} />
      </Campo>
      <Campo etiqueta="Notas">
        <textarea maxLength={1000} rows={2} className={claseInput} {...campo("notas")} />
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

/** Un producto que ya se usó no se borra (perdería su historial): se desactiva. */
function ActivarOBorrar({ producto }: { producto: ProductoDetalle }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [borrarAbierto, setBorrarAbierto] = useState(false);
  const activar = useMutation({
    mutationFn: (activo: boolean) => enviar("PATCH", `/productos/${producto.id}`, { activo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["producto", producto.id] });
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
  });
  const borrar = useMutation({
    mutationFn: () => enviar("DELETE", `/productos/${producto.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      navegar("/productos");
    },
  });
  return (
    <>
      <Boton disabled={activar.isPending} onClick={() => activar.mutate(!producto.activo)}>
        {producto.activo ? "Desactivar" : "Volver a activar"}
      </Boton>
      {producto.veces === 0 && (
        <Boton variante="peligro" onClick={() => (borrar.reset(), setBorrarAbierto(true))}>
          Borrar producto
        </Boton>
      )}
      <p className="w-full text-xs text-slate-500">
        {producto.activo
          ? "Desactivado ya no sale como sugerencia al cotizar, pero se conserva su historial."
          : "Está desactivado: no sale como sugerencia al cotizar."}
      </p>
      {activar.error && <Aviso>{activar.error.message}</Aviso>}
      <Confirmar
        abierto={borrarAbierto}
        titulo="¿Borrar producto?"
        textoBoton="Sí, borrar"
        peligro
        ocupado={borrar.isPending}
        error={borrar.error?.message}
        onCerrar={() => setBorrarAbierto(false)}
        onConfirmar={() => borrar.mutate()}
      >
        <p>
          Se borra <b>{producto.nombre}</b> del catálogo.
        </p>
      </Confirmar>
    </>
  );
}
