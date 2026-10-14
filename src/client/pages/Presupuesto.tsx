import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { hoyGuatemala, type Ajustes } from "../../shared/presupuesto";
import { api, type PresupuestoDetalle, type TrabajoDetalle } from "../api";
import { Aviso, Encabezado } from "../components/ui";
import { Editor, type ContextoEditor } from "../editor/Editor";
import { copiarSecciones, desdeItems, seccionVacia, type EditorEstado } from "../editor/modelo";
import { DesdeFotos } from "../lector/DesdeFotos";
import { fotosDe, olvidarFotos } from "../lector/fotos";
import { PanelFotos } from "../lector/PanelFotos";
import { PegarDeClaude } from "../lector/PegarDeClaude";
import { AccionesPdf } from "../pdf/AccionesPdf";

const texto = (n: number | null) => (n === null ? "" : String(n));

/** /presupuestos/:id — editar uno existente. */
export function PresupuestoExistente() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ["presupuesto", id], queryFn: () => api<PresupuestoDetalle>(`/presupuestos/${id}`) });
  const p = q.data;
  // Si se acaba de pasar de fotos, se siguen viendo arriba (solo en esta pestaña).
  const [, refrescar] = useState(0);
  const fotos = fotosDe(id);
  // El estado inicial se arma una sola vez por presupuesto (lo que llega después solo actualiza el contexto).
  const inicial = useMemo<EditorEstado | null>(
    () =>
      p
        ? {
            clienteId: p.trabajo.clienteId,
            busId: p.trabajo.busId,
            titulo: p.titulo ?? "",
            fecha: p.fecha ?? hoyGuatemala(),
            lugar: p.lugar ?? "",
            cerradoEn: texto(p.cerradoEn),
            anticipo: texto(p.anticipo),
            notas: p.notas ?? "",
            notaPie: p.notaPie ?? "",
            secciones: desdeItems(p.items),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p?.id],
  );
  if (q.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (q.error || !p || !inicial)
    return (
      <div className="space-y-3">
        <Encabezado titulo="Presupuesto" volver={{ to: "/presupuestos", texto: "Presupuestos" }} />
        <Aviso>{q.error?.message ?? "No encontrado"}</Aviso>
      </div>
    );
  const ctx: ContextoEditor = {
    id: p.id,
    trabajoId: p.trabajoId,
    tipo: p.tipo,
    numero: p.numero,
    estado: p.estado,
    trabajo: p.trabajo,
    hermanos: p.hermanos,
    respaldo: { origen: p.origen, sheetUrl: p.sheetUrl, respaldadoEn: p.respaldadoEn, respaldoError: p.respaldoError, actualizadoEn: p.actualizadoEn },
  };
  const panel = fotos ? <PanelFotos {...fotos} onOlvidar={() => (olvidarFotos(id), refrescar((n) => n + 1))} /> : undefined;
  return <Editor key={p.id} inicial={inicial} ctx={ctx} panel={panel} acciones={(x) => <AccionesPdf id={p.id} {...x} />} />;
}

/**
 * /presupuestos/nuevo
 *   ?trabajo=ID  → extra de ese trabajo
 *   ?base=ID     → copia las líneas de otro presupuesto
 *   ?cliente=ID  → con el cliente ya escogido
 *   ?modo=mano|fotos|pegar → sin modo (y sin base) primero se pregunta cómo hacerlo
 */
export function PresupuestoNuevo() {
  const [params] = useSearchParams();
  const modo = params.get("modo");
  const trabajoId = Number(params.get("trabajo")) || null;
  const baseId = Number(params.get("base")) || null;
  const clienteId = Number(params.get("cliente")) || null;

  const ajustes = useQuery({ queryKey: ["configuracion"], queryFn: () => api<Ajustes>("/configuracion") });
  const trabajo = useQuery({ queryKey: ["trabajo", trabajoId], queryFn: () => api<TrabajoDetalle>(`/trabajos/${trabajoId}`), enabled: !!trabajoId });
  const base = useQuery({ queryKey: ["presupuesto", baseId], queryFn: () => api<PresupuestoDetalle>(`/presupuestos/${baseId}`), enabled: !!baseId });

  const conModo = (m: string) => {
    const p = new URLSearchParams(params);
    p.set("modo", m);
    return `/presupuestos/nuevo?${p}`;
  };
  if (!baseId && modo !== "mano" && modo !== "fotos" && modo !== "pegar") return (
      <ElegirModo
        esExtra={!!trabajoId}
        mano={conModo("mano")}
        fotos={conModo("fotos")}
        pegar={conModo("pegar")}
        volver={trabajoId ? { to: `/trabajos/${trabajoId}`, texto: "Trabajo" } : clienteId ? { to: `/clientes/${clienteId}`, texto: "Cliente" } : { to: "/presupuestos", texto: "Presupuestos" }}
      />
    );

  const listo = !ajustes.isLoading && (!trabajoId || trabajo.data) && (!baseId || base.data);
  const error = trabajo.error ?? base.error;
  if (error) return <Aviso>{error.message}</Aviso>;
  if (!listo) return <p className="text-slate-500">Cargando…</p>;

  const t = trabajo.data;
  const inicial: EditorEstado = {
    clienteId: t?.clienteId ?? clienteId,
    busId: t?.busId ?? null,
    titulo: "",
    fecha: hoyGuatemala(),
    lugar: ajustes.data?.lugar ?? "",
    cerradoEn: "",
    anticipo: "",
    notas: "",
    notaPie: "",
    secciones: base.data ? copiarSecciones(desdeItems(base.data.items)) : trabajoId ? [seccionVacia("EXTRAS")] : [seccionVacia()],
  };
  const ctx: ContextoEditor = {
    id: null,
    trabajoId,
    tipo: trabajoId ? "extra" : "original",
    numero: 0,
    estado: "borrador",
    trabajo: t ? { id: t.id, estado: t.estado, cliente: t.cliente, clienteId: t.clienteId, bus: t.bus, placa: t.placa, busId: t.busId } : null,
    hermanos: t ? t.presupuestos.map((p) => ({ ...p, anticipo: null })) : [],
  };
  if ((modo === "fotos" || modo === "pegar") && !baseId) {
    const p = new URLSearchParams(params);
    p.delete("modo");
    const volver = `/presupuestos/nuevo${p.size ? `?${p}` : ""}`;
    return modo === "fotos" ? (
      <DesdeFotos key={`fotos-${trabajoId}-${clienteId}`} base={inicial} ctx={ctx} volver={volver} />
    ) : (
      <PegarDeClaude key={`pegar-${trabajoId}-${clienteId}`} base={inicial} ctx={ctx} volver={volver} />
    );
  }
  return <Editor key={`nuevo-${trabajoId}-${baseId}-${clienteId}`} inicial={inicial} ctx={ctx} />;
}

/** "¿Cómo lo quieres hacer?": a mano en el editor o desde fotos de la hoja escrita. */
function ElegirModo({ esExtra, mano, fotos, pegar, volver }: { esExtra: boolean; mano: string; fotos: string; pegar: string; volver: { to: string; texto: string } }) {
  const tarjeta = "flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-5 hover:border-marca-600 hover:bg-marca-50 focus-visible:outline-2 focus-visible:outline-marca-600";
  return (
    <section className="space-y-4">
      <Encabezado titulo={esExtra ? "Nuevo extra" : "Nuevo presupuesto"} detalle="¿Cómo lo quieres hacer?" volver={volver} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to={mano} replace className={tarjeta} autoFocus>
          <span className="text-lg font-semibold text-slate-900">Hacerlo a mano</span>
          <span className="text-sm text-slate-600">Escribir las líneas en el editor, con el catálogo y los precios sugeridos.</span>
        </Link>
        <Link to={fotos} replace className={tarjeta}>
          <span className="text-lg font-semibold text-slate-900">Desde fotos</span>
          <span className="text-sm text-slate-600">Tomar o subir fotos de la hoja escrita a mano. La app la pasa al editor y tú la revisas.</span>
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        ¿Claude ya te pasó el presupuesto en texto?{" "}
        <Link to={pegar} replace className="font-medium text-marca-700 hover:underline">
          Pegarlo aquí
        </Link>
      </p>
    </section>
  );
}
