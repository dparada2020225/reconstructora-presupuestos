import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { hoyGuatemala, type Ajustes } from "../../shared/presupuesto";
import { api, type PresupuestoDetalle, type TrabajoDetalle } from "../api";
import { Aviso, Encabezado } from "../components/ui";
import { Editor, type ContextoEditor } from "../editor/Editor";
import { copiarSecciones, desdeItems, seccionVacia, type EditorEstado } from "../editor/modelo";
import { AccionesPdf } from "../pdf/AccionesPdf";

const texto = (n: number | null) => (n === null ? "" : String(n));

/** /presupuestos/:id — editar uno existente. */
export function PresupuestoExistente() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ["presupuesto", id], queryFn: () => api<PresupuestoDetalle>(`/presupuestos/${id}`) });
  const p = q.data;
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
  };
  return <Editor key={p.id} inicial={inicial} ctx={ctx} acciones={(x) => <AccionesPdf id={p.id} {...x} />} />;
}

/**
 * /presupuestos/nuevo
 *   ?trabajo=ID  → extra de ese trabajo
 *   ?base=ID     → copia las líneas de otro presupuesto
 *   ?cliente=ID  → con el cliente ya escogido
 */
export function PresupuestoNuevo() {
  const [params] = useSearchParams();
  const trabajoId = Number(params.get("trabajo")) || null;
  const baseId = Number(params.get("base")) || null;
  const clienteId = Number(params.get("cliente")) || null;

  const ajustes = useQuery({ queryKey: ["configuracion"], queryFn: () => api<Ajustes>("/configuracion") });
  const trabajo = useQuery({ queryKey: ["trabajo", trabajoId], queryFn: () => api<TrabajoDetalle>(`/trabajos/${trabajoId}`), enabled: !!trabajoId });
  const base = useQuery({ queryKey: ["presupuesto", baseId], queryFn: () => api<PresupuestoDetalle>(`/presupuestos/${baseId}`), enabled: !!baseId });

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
  return <Editor key={`nuevo-${trabajoId}-${baseId}-${clienteId}`} inicial={inicial} ctx={ctx} />;
}
