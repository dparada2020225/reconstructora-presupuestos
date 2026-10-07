import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "react-router";
import { CATEGORIAS } from "../../shared/categorias";
import { montoTrabajo } from "../../shared/estadisticas";
import { nombreDocumento, type Ajustes } from "../../shared/presupuesto";
import { api, enviar, type EstadoPresupuesto, type Hermano, type ProductoFila } from "../api";
import { Aviso, Boton, Caja, Campo, claseInput, ComboBusqueda, Confirmar, ESTADO_PRESUPUESTO, ESTADO_TRABAJO, fechaCorta, formatoQ, Insignia } from "../components/ui";
import { DocumentoUnificado } from "../pdf/AccionesPdf";
import { AbonosTrabajo, EstadoPresupuestoCaja } from "./EstadoPagos";
import { NuevoBus, nombreBus, useOpcionesClientes } from "../pages/Buses";
import { NuevoCliente } from "../pages/Clientes";
import type { BusFila } from "../api";
import { CampoDescripcion, precioSugerido } from "./CampoDescripcion";
import {
  aEntrada,
  aNumero,
  lineaVacia,
  lineasIncompletas,
  nuevaKey,
  seccionVacia,
  totalEditor,
  totalLinea,
  totalSeccion,
  type EditorEstado,
  type LineaEd,
} from "./modelo";

export interface ContextoEditor {
  /** null = presupuesto nuevo. */
  id: number | null;
  trabajoId: number | null;
  tipo: "original" | "extra";
  numero: number;
  estado: EstadoPresupuesto;
  trabajo: { id: number; estado: keyof typeof ESTADO_TRABAJO; cliente: string; clienteId: number; bus: string | null; placa: string | null; busId: number | null } | null;
  hermanos: Hermano[];
}

const botonIcono = "rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent";

export function Editor({ inicial, ctx, acciones }: { inicial: EditorEstado; ctx: ContextoEditor; acciones?: (x: { guardarAntes: () => Promise<number | null>; sucio: boolean }) => React.ReactNode }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [e, setE] = useState(inicial);
  const [foco, setFoco] = useState<string | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [nuevoBus, setNuevoBus] = useState(false);
  const [borrar, setBorrar] = useState(false);

  const productos = useQuery({ queryKey: ["productos"], queryFn: () => api<ProductoFila[]>("/productos") });
  const buses = useQuery({ queryKey: ["buses"], queryFn: () => api<BusFila[]>("/buses") });
  const ajustes = useQuery({ queryKey: ["configuracion"], queryFn: () => api<Ajustes>("/configuracion") });
  const opcionesClientes = useOpcionesClientes();
  const opcionesBuses = useMemo(
    () =>
      (buses.data ?? [])
        .filter((b) => !e.clienteId || b.clienteId === e.clienteId)
        .map((b) => ({ id: b.id, etiqueta: nombreBus(b), detalle: b.placa && b.nombre ? b.placa : undefined, buscarEn: b.placa ?? "" })),
    [buses.data, e.clienteId],
  );

  /* ───── Cambios sin guardar ───── */
  const cuerpo = JSON.stringify(aEntrada(e, {}));
  const guardado = useRef(ctx.id ? JSON.stringify(aEntrada(inicial, {})) : null);
  const sucio = guardado.current !== cuerpo;
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  const bloqueo = useBlocker(({ currentLocation, nextLocation }) => sucioRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const avisar = (ev: BeforeUnloadEvent) => {
      if (sucioRef.current) ev.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, []);

  /* ───── Guardar ───── */
  const editableClienteBus = ctx.tipo === "original";
  const faltaCliente = !ctx.trabajoId && !e.clienteId;
  const incompletas = lineasIncompletas(e);
  const guardar = useMutation({
    mutationFn: async (): Promise<number> => {
      const datos = aEntrada(e, { trabajoId: ctx.id ? null : ctx.trabajoId });
      if (ctx.id) {
        await enviar("PUT", `/presupuestos/${ctx.id}`, datos);
        return ctx.id;
      }
      return (await enviar<{ id: number }>("POST", "/presupuestos", datos)).id;
    },
    onSuccess: (id) => {
      guardado.current = cuerpo;
      sucioRef.current = false;
      for (const k of ["presupuestos", "presupuesto", "trabajo", "cliente", "clientes", "productos", "producto", "buses", "bus", "estadisticas"])
        qc.invalidateQueries({ queryKey: [k] });
      if (!ctx.id) navegar(`/presupuestos/${id}`, { replace: true });
    },
  });
  const puedeGuardar = !faltaCliente && incompletas === 0 && !guardar.isPending;
  const guardarAntes = async () => {
    if (!puedeGuardar) return null;
    return sucio || !ctx.id ? await guardar.mutateAsync() : ctx.id;
  };

  useEffect(() => {
    const atajo = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        if (puedeGuardar) guardar.mutate();
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  });

  const quitar = useMutation({
    mutationFn: () => enviar("DELETE", `/presupuestos/${ctx.id}`),
    onSuccess: () => {
      sucioRef.current = false;
      qc.invalidateQueries();
      navegar("/presupuestos");
    },
  });

  /* ───── Edición ───── */
  const mutar = (fn: (d: EditorEstado) => void) =>
    setE((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
  const seccion = (d: EditorEstado, sk: string) => d.secciones.find((s) => s.key === sk)!;
  const linea = (d: EditorEstado, sk: string, lk: string) => seccion(d, sk).lineas.find((l) => l.key === lk)!;
  const cambiarLinea = (sk: string, lk: string, cambios: Partial<LineaEd>) => mutar((d) => Object.assign(linea(d, sk, lk), cambios));
  const agregarLinea = (sk: string, despuesDe?: string) => {
    const nueva = lineaVacia();
    mutar((d) => {
      const s = seccion(d, sk);
      const i = despuesDe ? s.lineas.findIndex((l) => l.key === despuesDe) + 1 : s.lineas.length;
      s.lineas.splice(i, 0, nueva);
    });
    setFoco(nueva.key);
  };
  const mover = <T,>(xs: T[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= xs.length) return;
    [xs[i], xs[j]] = [xs[j], xs[i]];
  };
  const agregarSeccion = (titulo: string) => {
    const s = seccionVacia(titulo);
    mutar((d) => {
      // Si solo hay una sección vacía sin título, se reemplaza.
      const unica = d.secciones.length === 1 && !d.secciones[0].titulo && d.secciones[0].lineas.every((l) => !l.descripcion && !l.precioUnitario);
      d.secciones = unica ? [s] : [...d.secciones, s];
    });
    setFoco(s.lineas[0].key);
  };
  const usadas = new Set(e.secciones.map((s) => s.titulo.trim().toUpperCase()));
  const total = totalEditor(e);
  const cerrado = aNumero(e.cerradoEn);
  const anticipo = aNumero(e.anticipo);

  const titulo = ctx.id
    ? `${ctx.trabajo?.cliente ?? "Presupuesto"} · ${nombreDocumento(ctx)}`
    : ctx.trabajoId
      ? `Nuevo extra · ${ctx.trabajo?.cliente ?? ""}`
      : "Nuevo presupuesto";

  return (
    <section className="space-y-4">
      {/* Encabezado */}
      <div className="space-y-1">
        <Link to={ctx.trabajoId ? `/trabajos/${ctx.trabajoId}` : "/presupuestos"} className="text-sm text-marca-700 hover:underline">
          ← {ctx.trabajoId ? "Trabajo" : "Presupuestos"}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{titulo}</h1>
            {ctx.id && <Insignia clase={ESTADO_PRESUPUESTO[ctx.estado].clase}>{ESTADO_PRESUPUESTO[ctx.estado].texto}</Insignia>}
            <span className={`text-sm ${sucio ? "text-amber-700" : "text-slate-500"}`} aria-live="polite">
              {guardar.isPending ? "Guardando…" : sucio ? "● Cambios sin guardar" : ctx.id ? "Guardado" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {acciones?.({ guardarAntes, sucio })}
            <Boton variante="primario" disabled={!puedeGuardar || (!sucio && !!ctx.id)} onClick={() => guardar.mutate()} title="Ctrl + S">
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </div>
        {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
        {faltaCliente && <p className="text-sm text-slate-600">Escoge el cliente para poder guardar.</p>}
        {incompletas > 0 && <p className="text-sm text-amber-800">Hay {incompletas} {incompletas === 1 ? "línea con precio pero" : "líneas con precio pero"} sin descripción.</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-4">
          {/* Datos */}
          <Caja>
            <div className="grid gap-3 sm:grid-cols-2">
              {editableClienteBus ? (
                <>
                  <Campo etiqueta="Cliente">
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <ComboBusqueda
                          opciones={opcionesClientes}
                          valor={e.clienteId}
                          onChange={(clienteId) => mutar((d) => {
                            if (d.clienteId !== clienteId) d.busId = null;
                            d.clienteId = clienteId;
                          })}
                          permitirVacio={false}
                          placeholder="Buscar cliente…"
                          autoFocus={!ctx.id && !e.clienteId}
                        />
                      </div>
                      <Boton onClick={() => setNuevoCliente(true)} title="Cliente nuevo">+</Boton>
                    </div>
                  </Campo>
                  <Campo etiqueta="Bus (placa o nombre)">
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <ComboBusqueda opciones={opcionesBuses} valor={e.busId} onChange={(busId) => mutar((d) => void (d.busId = busId))} sinValor="Sin bus" placeholder="Buscar bus…" />
                      </div>
                      <Boton onClick={() => setNuevoBus(true)} disabled={!e.clienteId} title="Bus nuevo">+</Boton>
                    </div>
                  </Campo>
                </>
              ) : (
                <div className="sm:col-span-2 text-sm">
                  <span className="text-slate-500">Extra del trabajo de </span>
                  <Link className="font-medium text-marca-700 hover:underline" to={`/trabajos/${ctx.trabajoId}`}>
                    {ctx.trabajo?.cliente}
                  </Link>
                  {(ctx.trabajo?.bus || ctx.trabajo?.placa) && (
                    <span className="text-slate-600"> · {[ctx.trabajo.placa, ctx.trabajo.bus].filter(Boolean).join(" / ")}</span>
                  )}
                </div>
              )}
              <Campo etiqueta="Fecha">
                <input type="date" required className={claseInput} value={e.fecha} onChange={(ev) => mutar((d) => void (d.fecha = ev.target.value))} />
              </Campo>
              <Campo etiqueta="Lugar">
                <input className={claseInput} maxLength={160} value={e.lugar} placeholder={ajustes.data?.lugar || "Lugar"} onChange={(ev) => mutar((d) => void (d.lugar = ev.target.value))} />
              </Campo>
            </div>
          </Caja>

          {/* Secciones */}
          {e.secciones.map((s, si) => (
            <div key={s.key} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
                <input
                  aria-label="Título de la sección"
                  list="secciones-comunes"
                  className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 font-semibold uppercase tracking-wide text-slate-800 hover:border-slate-200 focus:border-marca-600 focus:outline-none"
                  placeholder="SECCIÓN (ADENTRO, AFUERA…) — opcional"
                  value={s.titulo}
                  maxLength={80}
                  onChange={(ev) => mutar((d) => void (seccion(d, s.key).titulo = ev.target.value.toUpperCase()))}
                />
                <span className="text-sm tabular-nums text-slate-600">{formatoQ(totalSeccion(s))}</span>
                <button type="button" className={botonIcono} disabled={si === 0} onClick={() => mutar((d) => mover(d.secciones, si, -1))} aria-label="Subir sección">
                  ↑
                </button>
                <button type="button" className={botonIcono} disabled={si === e.secciones.length - 1} onClick={() => mutar((d) => mover(d.secciones, si, 1))} aria-label="Bajar sección">
                  ↓
                </button>
                <button
                  type="button"
                  className={botonIcono}
                  onClick={() => mutar((d) => void (d.secciones = d.secciones.length > 1 ? d.secciones.filter((x) => x.key !== s.key) : [seccionVacia()]))}
                  aria-label="Quitar sección"
                  title="Quitar sección"
                >
                  ✕
                </button>
              </div>

              <div className="hidden gap-2 px-3 pt-2 text-xs text-slate-500 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_7rem_6.5rem]">
                <span>Descripción</span>
                <span className="text-right">Cant.</span>
                <span className="text-right">Precio c/u</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              <ol className="space-y-1 p-2">
                {s.lineas.map((l, li) => {
                  const t = totalLinea(l);
                  return (
                    <li key={l.key} className="rounded-md px-1 py-1 hover:bg-slate-50">
                      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_7.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_7rem_6.5rem]">
                        <div className="col-span-3 sm:col-span-1">
                          <CampoDescripcion
                            valor={l.descripcion}
                            productos={productos.data ?? []}
                            enlazado={l.productoId !== null}
                            autoFocus={foco === l.key}
                            onCambio={(texto) => cambiarLinea(s.key, l.key, { descripcion: texto, productoId: null })}
                            onElegir={(p) => {
                              const precio = precioSugerido(p);
                              cambiarLinea(s.key, l.key, { descripcion: p.nombre, productoId: p.id, ...(precio !== null && !aNumero(l.precioUnitario) ? { precioUnitario: String(precio) } : {}) });
                            }}
                            onEnter={() => agregarLinea(s.key, l.key)}
                          />
                        </div>
                        <input
                          aria-label="Cantidad"
                          inputMode="decimal"
                          className={`${claseInput} text-right tabular-nums`}
                          value={l.cantidad}
                          onChange={(ev) => cambiarLinea(s.key, l.key, { cantidad: ev.target.value })}
                        />
                        <div className="flex items-center gap-1">
                          <input
                            aria-label="Precio por unidad"
                            inputMode="decimal"
                            className={`${claseInput} text-right tabular-nums`}
                            placeholder={l.precioPendiente ? "?" : "Q"}
                            disabled={l.precioPendiente}
                            value={l.precioPendiente ? "" : l.precioUnitario}
                            onChange={(ev) => cambiarLinea(s.key, l.key, { precioUnitario: ev.target.value })}
                            onKeyDown={(ev) => ev.key === "Enter" && (ev.preventDefault(), agregarLinea(s.key, l.key))}
                          />
                        </div>
                        <span className="hidden text-right text-sm tabular-nums sm:block">{l.precioPendiente ? "?" : t !== null ? formatoQ(t) : <span className="text-slate-300">—</span>}</span>
                        <div className="col-span-3 flex items-center justify-end gap-0.5 sm:col-span-1">
                          <span className="mr-auto text-sm tabular-nums sm:hidden">{l.precioPendiente ? "?" : t !== null ? formatoQ(t) : ""}</span>
                          <button
                            type="button"
                            className={`${botonIcono} ${l.precioPendiente ? "bg-amber-100 text-amber-900" : ""}`}
                            aria-pressed={l.precioPendiente}
                            title="Precio por definir (?)"
                            onClick={() => cambiarLinea(s.key, l.key, { precioPendiente: !l.precioPendiente })}
                          >
                            ?
                          </button>
                          <button
                            type="button"
                            className={botonIcono}
                            title="Agregar detalle debajo (no suma)"
                            onClick={() => {
                              const k = nuevaKey();
                              mutar((d) => linea(d, s.key, l.key).detalles.push({ key: k, texto: "" }));
                              setFoco(k);
                            }}
                          >
                            ↳
                          </button>
                          <button type="button" className={botonIcono} disabled={li === 0} onClick={() => mutar((d) => mover(seccion(d, s.key).lineas, li, -1))} aria-label="Subir línea">
                            ↑
                          </button>
                          <button
                            type="button"
                            className={botonIcono}
                            disabled={li === s.lineas.length - 1}
                            onClick={() => mutar((d) => mover(seccion(d, s.key).lineas, li, 1))}
                            aria-label="Bajar línea"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className={botonIcono}
                            onClick={() => mutar((d) => {
                              const sec = seccion(d, s.key);
                              sec.lineas = sec.lineas.filter((x) => x.key !== l.key);
                              if (!sec.lineas.length) sec.lineas.push(lineaVacia());
                            })}
                            aria-label="Quitar línea"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {l.detalles.map((dt) => (
                        <div key={dt.key} className="mt-1 flex items-center gap-2 pl-6">
                          <span className="text-slate-400" aria-hidden>
                            •
                          </span>
                          <input
                            aria-label="Detalle"
                            autoFocus={foco === dt.key}
                            className={`${claseInput} py-1 text-slate-700`}
                            placeholder="Detalle (no suma al total)"
                            value={dt.texto}
                            onChange={(ev) => mutar((d) => void (linea(d, s.key, l.key).detalles.find((x) => x.key === dt.key)!.texto = ev.target.value))}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") {
                                ev.preventDefault();
                                const k = nuevaKey();
                                mutar((d) => {
                                  const ds = linea(d, s.key, l.key).detalles;
                                  ds.splice(ds.findIndex((x) => x.key === dt.key) + 1, 0, { key: k, texto: "" });
                                });
                                setFoco(k);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className={botonIcono}
                            onClick={() => mutar((d) => {
                              const ln = linea(d, s.key, l.key);
                              ln.detalles = ln.detalles.filter((x) => x.key !== dt.key);
                            })}
                            aria-label="Quitar detalle"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ol>
              <div className="px-3 pb-3">
                <Boton variante="texto" onClick={() => agregarLinea(s.key)}>
                  + Línea
                </Boton>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Boton onClick={() => agregarSeccion("")}>+ Sección</Boton>
            {CATEGORIAS.filter((c) => !usadas.has(c)).map((c) => (
              <button key={c} type="button" onClick={() => agregarSeccion(c)} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600 hover:border-marca-600 hover:text-marca-700">
                + {c}
              </button>
            ))}
          </div>
          <datalist id="secciones-comunes">
            {[...CATEGORIAS, "EXTRAS"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <Caja titulo="Notas">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Nota al pie del PDF" ayuda="Si la dejas vacía va la nota de siempre.">
                <textarea rows={2} maxLength={600} className={claseInput} placeholder={ajustes.data?.nota} value={e.notaPie} onChange={(ev) => mutar((d) => void (d.notaPie = ev.target.value))} />
              </Campo>
              <Campo etiqueta="Notas internas" ayuda="Solo se ven aquí, no salen en el PDF.">
                <textarea rows={2} maxLength={4000} className={claseInput} value={e.notas} onChange={(ev) => mutar((d) => void (d.notas = ev.target.value))} />
              </Campo>
            </div>
          </Caja>
        </div>

        {/* Totales */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Caja titulo="Total">
            <dl className="space-y-1 text-sm">
              {e.secciones.length > 1 &&
                e.secciones.map((s) => (
                  <div key={s.key} className="flex justify-between gap-2 text-slate-600">
                    <dt className="truncate">{s.titulo || "Sin sección"}</dt>
                    <dd className="tabular-nums">{formatoQ(totalSeccion(s))}</dd>
                  </div>
                ))}
              <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-2">
                <dt className="font-medium">Total</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatoQ(total)}</dd>
              </div>
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Campo etiqueta="Cerrado en">
                <input inputMode="decimal" className={`${claseInput} text-right tabular-nums`} placeholder="—" value={e.cerradoEn} onChange={(ev) => mutar((d) => void (d.cerradoEn = ev.target.value))} />
              </Campo>
              <Campo etiqueta="Anticipo">
                <input inputMode="decimal" className={`${claseInput} text-right tabular-nums`} placeholder="—" value={e.anticipo} onChange={(ev) => mutar((d) => void (d.anticipo = ev.target.value))} />
              </Campo>
            </div>
            {(cerrado !== null || anticipo !== null) && (
              <p className="mt-2 flex justify-between text-sm">
                <span className="text-slate-600">Saldo</span>
                <span className="font-medium tabular-nums">{formatoQ((cerrado ?? total) - (anticipo ?? 0))}</span>
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">El anticipo sale en el PDF de este presupuesto.</p>
          </Caja>

          {ctx.id && <EstadoPresupuestoCaja id={ctx.id} estado={ctx.estado} guardarAntes={guardarAntes} />}

          {ctx.trabajoId ? (
            <ResumenTrabajo ctx={ctx} totalActual={total} cerradoActual={cerrado} guardarAntes={guardarAntes} />
          ) : (
            <Caja titulo="Todo el trabajo">
              <p className="text-sm text-slate-500">Guarda el presupuesto para registrar los abonos del trabajo.</p>
            </Caja>
          )}

          {ctx.id && (
            <Caja titulo="Más">
              <div className="flex flex-col items-start gap-2">
                <Link className="text-sm text-marca-700 hover:underline" to={`/presupuestos/nuevo?base=${ctx.id}`}>
                  Usar como base para otro presupuesto
                </Link>
                {ctx.trabajoId && (
                  <Link className="text-sm text-marca-700 hover:underline" to={`/presupuestos/nuevo?trabajo=${ctx.trabajoId}`}>
                    Agregar extra a este trabajo
                  </Link>
                )}
                {ctx.estado === "borrador" && (
                  <Boton variante="peligro" onClick={() => (quitar.reset(), setBorrar(true))}>
                    Borrar borrador
                  </Boton>
                )}
              </div>
            </Caja>
          )}
        </aside>
      </div>

      <NuevoCliente
        abierto={nuevoCliente}
        onCerrar={() => setNuevoCliente(false)}
        nombreInicial=""
        onCreado={(id) => {
          mutar((d) => {
            d.clienteId = id;
            d.busId = null;
          });
          setNuevoCliente(false);
        }}
      />
      <NuevoBus
        abierto={nuevoBus}
        onCerrar={() => setNuevoBus(false)}
        clienteId={e.clienteId}
        irAlCrear={false}
        onCreado={(id) => mutar((d) => void (d.busId = id))}
      />
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este borrador?"
        textoBoton="Sí, borrar"
        peligro
        ocupado={quitar.isPending}
        error={quitar.error?.message}
        onCerrar={() => setBorrar(false)}
        onConfirmar={() => quitar.mutate()}
      >
        <p>Se borra el presupuesto{ctx.hermanos.length <= 1 ? " y su trabajo (no tiene otros presupuestos)" : ""}.</p>
      </Confirmar>
      <Confirmar
        abierto={bloqueo.state === "blocked"}
        titulo="Hay cambios sin guardar"
        textoBoton="Salir sin guardar"
        peligro
        onCerrar={() => bloqueo.reset?.()}
        onConfirmar={() => bloqueo.proceed?.()}
      >
        <p>Si sales ahora se pierden los cambios de este presupuesto.</p>
      </Confirmar>
    </section>
  );
}

/** Original + extras del trabajo, con el total que se está editando en vivo. */
function ResumenTrabajo({
  ctx,
  totalActual,
  cerradoActual,
  guardarAntes,
}: {
  ctx: ContextoEditor;
  totalActual: number;
  cerradoActual: number | null;
  guardarAntes: () => Promise<number | null>;
}) {
  // Los cancelados no cuentan en el total del trabajo.
  const docs = [...ctx.hermanos.filter((h) => h.id !== ctx.id && h.estado !== "cancelado")];
  const actual = { id: ctx.id ?? -1, tipo: ctx.tipo, numero: ctx.id ? ctx.numero : Math.max(0, ...ctx.hermanos.map((h) => h.numero)) + 1, total: totalActual, cerradoEn: cerradoActual, fecha: null };
  const todos = [...docs, actual].sort((a, b) => a.numero - b.numero);
  const m = montoTrabajo(todos);
  return (
    <Caja titulo="Todo el trabajo">
      <ul className="space-y-1 text-sm">
        {todos.map((d) => (
          <li key={d.id} className={`flex justify-between gap-2 ${d.id === actual.id ? "font-medium" : "text-slate-600"}`}>
            {d.id === actual.id ? (
              <span>{nombreDocumento({ tipo: d.numero ? "extra" : "original", numero: d.numero })} (este)</span>
            ) : (
              <Link className="hover:underline" to={`/presupuestos/${d.id}`}>
                {nombreDocumento(d)} {d.fecha && <span className="text-xs text-slate-400">{fechaCorta(d.fecha)}</span>}
              </Link>
            )}
            <span className="tabular-nums">
              {formatoQ(d.total)}
              {d.cerradoEn !== null && <span className="block text-right text-xs text-slate-500">cerrado {formatoQ(d.cerradoEn)}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-medium">
        <span>Total del trabajo</span>
        <span className="tabular-nums">{formatoQ(m.final)}</span>
      </p>
      {ctx.trabajoId && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <AbonosTrabajo trabajoId={ctx.trabajoId} monto={m.final} />
        </div>
      )}
      {ctx.id && ctx.trabajoId && todos.length > 1 && (
        <div className="mt-3">
          <DocumentoUnificado trabajoId={ctx.trabajoId} guardarAntes={guardarAntes} />
        </div>
      )}
    </Caja>
  );
}
