import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Estadisticas as Datos } from "../../shared/estadisticas";
import { api } from "../api";
import { BarrasH, Columnas, ConTabla, formatoQ, formatoQCorto, Indicador, Linea, Tabla, Tarjeta } from "../components/graficas";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fecha = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" }) : "—");

export function Estadisticas() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const consulta = useQuery({
    queryKey: ["estadisticas", desde, hasta],
    queryFn: () => api<Datos>(`/estadisticas?${new URLSearchParams({ ...(desde && { desde }), ...(hasta && { hasta }) })}`),
    placeholderData: keepPreviousData,
  });
  const d = consulta.data;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estadísticas</h1>
          {d && (
            <p className="mt-1 text-sm text-slate-600">
              {fecha(d.resumen.primeraFecha)} — {fecha(d.resumen.ultimaFecha)}
            </p>
          )}
        </div>
        <div className="flex items-end gap-2 text-sm">
          <SelectorAnio etiqueta="Desde" valor={desde} anios={d?.anios ?? []} onChange={setDesde} />
          <SelectorAnio etiqueta="Hasta" valor={hasta} anios={d?.anios ?? []} onChange={setHasta} />
          {(desde || hasta) && (
            <button className="rounded-md px-2 py-1.5 text-marca-600 hover:bg-marca-50" onClick={() => (setDesde(""), setHasta(""))}>
              Todo
            </button>
          )}
        </div>
      </div>

      {consulta.isLoading && <p className="text-slate-500">Cargando estadísticas…</p>}
      {consulta.error && <p className="text-red-700">No se pudieron cargar las estadísticas: {consulta.error.message}</p>}
      {d && (
        <div className={`space-y-5 transition-opacity ${consulta.isFetching ? "opacity-60" : ""}`}>
          {d.resumen.presupuestos === 0 ? <p className="text-slate-600">No hay presupuestos en ese rango.</p> : <Tablero d={d} />}
        </div>
      )}
    </section>
  );
}

function SelectorAnio({ etiqueta, valor, anios, onChange }: { etiqueta: string; valor: string; anios: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{etiqueta}</span>
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos</option>
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </label>
  );
}

function Tablero({ d }: { d: Datos }) {
  const r = d.resumen;
  const [productoId, setProductoId] = useState<number | null>(null);
  const productoSel = d.productos.find((p) => p.id === productoId) ?? d.productos[0];
  const evolucion = useMemo(
    () => d.precios.filter((p) => p.productoId === productoSel?.id),
    [d.precios, productoSel?.id],
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-1 xl:col-span-2">
          <p className="text-sm text-slate-500">Total cotizado</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-900">{formatoQ(r.totalCotizado)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatoQ(r.totalFinal)} tomando el “cerrado en” cuando existe
          </p>
        </div>
        <Indicador etiqueta="Clientes" valor={String(r.clientes)} detalle={`${r.clientesRecurrentes} regresaron más de una vez`} />
        <Indicador etiqueta="Buses identificados" valor={String(r.buses)} detalle={`${r.busesConPlaca} con placa · ${r.trabajosSinBus} trabajos sin bus`} />
        <Indicador etiqueta="Trabajos" valor={String(r.trabajos)} detalle={`${r.presupuestos} presupuestos · ${r.lineas.toLocaleString("en-US")} líneas`} />
        <Indicador etiqueta="Trabajo típico" valor={formatoQCorto(r.ticketMediana)} detalle={`mediana · promedio ${formatoQCorto(r.ticketPromedio)}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Indicador
          etiqueta="Trabajos con extras"
          valor={`${r.trabajosConExtras} de ${r.trabajos} (${pct(r.trabajosConExtras / Math.max(r.trabajos, 1))})`}
          detalle={`En esos trabajos los extras sumaron ${formatoQ(r.montoExtras)}, +${pct(r.montoExtras / Math.max(r.montoOriginalConExtras, 1))} sobre el original`}
        />
        <Indicador
          etiqueta="Rebaja al cerrar"
          valor={r.trabajosCerrados ? pct(r.rebajaPromedio) : "—"}
          detalle={`promedio en ${r.trabajosCerrados} trabajos con “cerrado en”`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Monto cotizado por año">
          <ConTabla
            grafica={
              <Columnas
                titulo="Monto cotizado por año"
                datos={d.porAnio.map((a) => ({ etiqueta: a.anio, valor: a.monto, detalle: `${a.anio} · ${a.trabajos} trabajos nuevos · ${a.presupuestos} presupuestos` }))}
                formato={formatoQ}
                formatoEje={formatoQCorto}
              />
            }
            tabla={
              <Tabla
                columnas={[{ titulo: "Año" }, { titulo: "Trabajos nuevos", derecha: true }, { titulo: "Presupuestos", derecha: true }, { titulo: "Monto", derecha: true }]}
                filas={d.porAnio.map((a) => [a.anio, a.trabajos, a.presupuestos, formatoQ(a.monto)])}
              />
            }
          />
        </Tarjeta>

        <Tarjeta titulo="Temporada: presupuestos por mes">
          <ConTabla
            grafica={
              <Columnas
                titulo="Presupuestos por mes"
                datos={d.porMes.map((n, i) => ({ etiqueta: MESES[i], valor: n, detalle: `${MESES[i]} · presupuestos de todos los años` }))}
              />
            }
            tabla={<Tabla columnas={[{ titulo: "Mes" }, { titulo: "Presupuestos", derecha: true }]} filas={d.porMes.map((n, i) => [MESES[i], n])} />}
          />
        </Tarjeta>

        <Tarjeta titulo="Clientes que más han dejado">
          <ConTabla
            grafica={
              <BarrasH
                titulo="Clientes por monto"
                datos={d.clientes.slice(0, 10).map((c) => ({ etiqueta: c.nombre, valor: c.monto, detalle: `${c.trabajos} trabajos · ${c.buses} buses` }))}
                formato={formatoQCorto}
              />
            }
            tabla={
              <Tabla
                columnas={[{ titulo: "Cliente" }, { titulo: "Trabajos", derecha: true }, { titulo: "Presup.", derecha: true }, { titulo: "Buses", derecha: true }, { titulo: "Monto", derecha: true }, { titulo: "Último" }]}
                filas={d.clientes.map((c) => [c.nombre, c.trabajos, c.presupuestos, c.buses, formatoQ(c.monto), fecha(c.ultima)])}
              />
            }
          />
        </Tarjeta>

        <Tarjeta titulo="Lo que más se pide">
          <ConTabla
            grafica={
              <BarrasH
                titulo="Productos más pedidos"
                datos={d.productos.slice(0, 12).map((p) => ({ etiqueta: p.nombre, valor: p.veces, detalle: `${formatoQ(p.monto)} en total` }))}
                formato={(n) => `${n} veces`}
              />
            }
            tabla={
              <Tabla
                columnas={[{ titulo: "Trabajo / producto" }, { titulo: "Veces", derecha: true }, { titulo: "Monto", derecha: true }, { titulo: "Precio típico", derecha: true }]}
                filas={d.productos.map((p) => [p.nombre, p.veces, formatoQ(p.monto), p.medianaUnitario ? formatoQ(p.medianaUnitario) : "—"])}
              />
            }
          />
        </Tarjeta>

        <Tarjeta
          titulo="Cómo ha cambiado el precio"
          accion={
            <select
              className="max-w-[16rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              value={productoSel?.id ?? ""}
              onChange={(e) => setProductoId(Number(e.target.value))}
              aria-label="Producto"
            >
              {d.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          }
        >
          {evolucion.length ? (
            <ConTabla
              grafica={
                <>
                  <Linea
                    titulo={`Precio típico de ${productoSel?.nombre}`}
                    datos={evolucion.map((p) => ({ etiqueta: p.anio, valor: p.mediana, detalle: `${p.anio} · mediana de ${p.n} ${p.n === 1 ? "vez" : "veces"}` }))}
                    formato={formatoQ}
                  />
                  <p className="mt-1 text-xs text-slate-500">Precio típico (mediana) por unidad en cada año. Pasa el mouse para ver cuántas veces se cotizó.</p>
                </>
              }
              tabla={
                <Tabla
                  columnas={[{ titulo: "Año" }, { titulo: "Precio típico", derecha: true }, { titulo: "Veces", derecha: true }]}
                  filas={evolucion.map((p) => [p.anio, formatoQ(p.mediana), p.n])}
                />
              }
            />
          ) : (
            <p className="text-sm text-slate-500">Sin precios para este producto en el rango.</p>
          )}
        </Tarjeta>

        <Tarjeta titulo="Por categoría">
          <ConTabla
            grafica={
              <BarrasH
                titulo="Monto por categoría"
                datos={d.categorias.map((c) => ({ etiqueta: c.categoria, valor: c.monto, detalle: `${c.lineas} líneas` }))}
                formato={formatoQCorto}
              />
            }
            tabla={
              <Tabla
                columnas={[{ titulo: "Categoría" }, { titulo: "Líneas", derecha: true }, { titulo: "Monto", derecha: true }]}
                filas={d.categorias.map((c) => [c.categoria, c.lineas, formatoQ(c.monto)])}
              />
            }
          />
          <p className="mt-2 text-xs text-slate-500">Según la sección del presupuesto (ADENTRO, AFUERA, TROMPA…). “Sin sección” son líneas que no estaban bajo ningún título.</p>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Buses">
        <div className="max-h-80 overflow-auto">
          <Tabla
            columnas={[{ titulo: "Bus" }, { titulo: "Placa" }, { titulo: "Cliente" }, { titulo: "Trabajos", derecha: true }]}
            filas={d.buses.map((b) => [b.nombre ?? "—", b.placa ?? "—", b.cliente, b.trabajos])}
          />
        </div>
      </Tarjeta>
    </>
  );
}
