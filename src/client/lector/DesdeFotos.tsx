import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { MAX_FOTOS, PROVEEDORES_LECTOR, type ProveedorLector, type RespuestaLector } from "../../shared/lector";
import { api, enviar, type BusFila, type ClienteFila, type EstadoLector, type ProductoFila, type Usuario } from "../api";
import { Aviso, Boton, Caja, Campo, claseInput, Encabezado } from "../components/ui";
import { Editor, type ContextoEditor } from "../editor/Editor";
import type { EditorEstado } from "../editor/modelo";
import { estadoDesdeLectura, vocabularioDe, type ResultadoLectura } from "./desdeLectura";
import { achicarFoto, recordarFotos, type FotosLeidas } from "./fotos";
import { PanelFotos } from "./PanelFotos";

/**
 * /presupuestos/nuevo?modo=fotos — sube las fotos de la hoja escrita a mano, la IA la lee y se
 * abre el editor normal con todo lleno (como borrador nuevo) y las fotos arriba para comparar.
 */
export function DesdeFotos({ base, ctx, volver }: { base: EditorEstado; ctx: ContextoEditor; volver: string }) {
  const qc = useQueryClient();
  const estado = useQuery({ queryKey: ["lector"], queryFn: () => api<EstadoLector>("/lector") });
  const yo = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });
  const productos = useQuery({ queryKey: ["productos"], queryFn: () => api<ProductoFila[]>("/productos") });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => api<ClienteFila[]>("/clientes") });
  const buses = useQuery({ queryKey: ["buses"], queryFn: () => api<BusFila[]>("/buses") });

  const [fotos, setFotos] = useState<string[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [errorFotos, setErrorFotos] = useState<string | null>(null);
  const [elegido, setElegido] = useState<ProveedorLector | null>(null);
  const [resultado, setResultado] = useState<(ResultadoLectura & FotosLeidas) | null>(null);

  const disponibles = (estado.data?.proveedores ?? []).filter((p) => p.disponible);
  const proveedor = elegido ?? estado.data?.proveedor ?? null;
  const agotado = !!estado.data && estado.data.usoHoy >= estado.data.limite;

  const agregar = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setErrorFotos(null);
    const lista = [...archivos].slice(0, MAX_FOTOS - fotos.length);
    if (archivos.length > lista.length) setErrorFotos(`Máximo ${MAX_FOTOS} fotos por presupuesto.`);
    setPreparando(true);
    try {
      const nuevas: string[] = [];
      for (const a of lista) nuevas.push(await achicarFoto(a));
      setFotos((f) => [...f, ...nuevas].slice(0, MAX_FOTOS));
    } catch (e) {
      setErrorFotos((e as Error).message);
    } finally {
      setPreparando(false);
    }
  };
  const mover = (i: number, dir: -1 | 1) =>
    setFotos((f) => {
      const g = [...f];
      [g[i], g[i + dir]] = [g[i + dir], g[i]];
      return g;
    });

  const leer = useMutation({
    mutationFn: () =>
      enviar<RespuestaLector>("POST", "/lector", {
        fotos,
        vocabulario: vocabularioDe(productos.data ?? []),
        ...(elegido ? { proveedor: elegido } : {}),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lector"] });
      const origen = PROVEEDORES_LECTOR[r.proveedor].nombre;
      const res = estadoDesdeLectura(base, r.lectura, { origen: `fotos con ${origen}`, esExtra: !!ctx.trabajoId, clientes: clientes.data ?? [], buses: buses.data ?? [] });
      setResultado({ ...res, fotos, origen });
    },
    onError: () => qc.invalidateQueries({ queryKey: ["lector"] }),
  });

  if (resultado) {
    const panel: FotosLeidas = { fotos: resultado.fotos, avisos: resultado.avisos, origen: resultado.origen };
    return (
      <Editor
        key={`fotos-${resultado.fotos.length}-${resultado.inicial.secciones[0]?.key}`}
        inicial={resultado.inicial}
        ctx={ctx}
        panel={<PanelFotos {...panel} />}
        nombreClienteNuevo={resultado.clienteEscrito ?? ""}
        nuevos={resultado.nuevos}
        alGuardarNuevo={(id) => recordarFotos(id, panel)}
        accionExtra={
          <Boton variante="texto" onClick={() => setResultado(null)} title="Volver a las fotos (se pierde lo que cambiaste aquí)">
            Leer otra vez
          </Boton>
        }
      />
    );
  }

  const titulo = ctx.trabajoId ? `Nuevo extra desde fotos · ${ctx.trabajo?.cliente ?? ""}` : "Nuevo presupuesto desde fotos";
  return (
    <section className="space-y-4">
      <Encabezado titulo={titulo} volver={{ to: volver, texto: "Escoger otra forma" }} />

      <Caja>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Toma o sube fotos de las hojas del presupuesto escrito a mano, <strong>en orden</strong>. La app las lee y te abre el presupuesto lleno para que lo revises
            y lo corrijas antes de guardarlo.
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500">
            <li>Una hoja por foto, derecha, con buena luz y sin sombra encima.</li>
            <li>Que se vean los precios de la orilla y los TOTAL.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <label className={`inline-flex cursor-pointer items-center rounded-md bg-marca-700 px-3 py-2 text-sm font-medium text-white hover:bg-marca-600 ${fotos.length >= MAX_FOTOS ? "pointer-events-none opacity-50" : ""}`}>
              Tomar foto
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => (agregar(e.target.files), (e.target.value = ""))} />
            </label>
            <label className={`inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 ${fotos.length >= MAX_FOTOS ? "pointer-events-none opacity-50" : ""}`}>
              Escoger fotos
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => (agregar(e.target.files), (e.target.value = ""))} />
            </label>
            {preparando && <span className="self-center text-sm text-slate-500">Preparando fotos…</span>}
          </div>
          {errorFotos && <Aviso>{errorFotos}</Aviso>}

          {fotos.length > 0 && (
            <ol className="flex gap-3 overflow-x-auto pb-1">
              {fotos.map((f, i) => (
                <li key={i} className="shrink-0 space-y-1">
                  <img src={f} alt={`Hoja ${i + 1}`} className="h-48 w-auto rounded border border-slate-200 object-contain" />
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span className="text-slate-600">Hoja {i + 1}</span>
                    <span className="flex">
                      <button type="button" className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Antes">
                        ←
                      </button>
                      <button type="button" className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30" disabled={i === fotos.length - 1} onClick={() => mover(i, 1)} aria-label="Después">
                        →
                      </button>
                      <button type="button" className="rounded px-1.5 py-0.5 text-red-700 hover:bg-red-50" onClick={() => setFotos((g) => g.filter((_, j) => j !== i))} aria-label="Quitar foto">
                        ✕
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Caja>

      <Caja>
        <div className="flex flex-wrap items-end gap-3">
          {disponibles.length > 1 && (
            <Campo etiqueta="Lector" className="min-w-56">
              <select className={claseInput} value={proveedor ?? ""} onChange={(e) => setElegido(e.target.value as ProveedorLector)}>
                {disponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.id === estado.data?.proveedor ? " (el de siempre)" : ""}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Boton variante="primario" className="px-4 py-2" disabled={!fotos.length || preparando || leer.isPending || agotado || !proveedor} onClick={() => leer.mutate()}>
            {leer.isPending ? "Leyendo…" : "Leer presupuesto"}
          </Boton>
          {estado.data && (
            <span className="text-xs text-slate-500">
              {proveedor && disponibles.length <= 1 && <>Lector: {PROVEEDORES_LECTOR[proveedor].nombre} · </>}
              Hoy: {estado.data.usoHoy} de {estado.data.limite}
            </span>
          )}
        </div>
        {leer.isPending && <p className="mt-3 text-sm text-slate-600">Leyendo las fotos… puede tardar hasta un minuto. No cierres esta página.</p>}
        {leer.error && (
          <div className="mt-3">
            <Aviso>{leer.error.message}</Aviso>
          </div>
        )}
        {agotado && (
          <div className="mt-3">
            <Aviso tono="info">Ya se llegó al límite de lecturas de hoy. Mañana se puede de nuevo, o hazlo a mano.</Aviso>
          </div>
        )}
        {estado.data && !disponibles.length && (
          <div className="mt-3">
            <Aviso tono="info">El lector de fotos no está configurado todavía.</Aviso>
          </div>
        )}
        {yo.data?.rol === "admin" && (
          <p className="mt-3 text-xs text-slate-500">
            El lector de siempre se cambia en{" "}
            <Link to="/ajustes" className="text-marca-700 hover:underline">
              Ajustes
            </Link>
            .
          </p>
        )}
      </Caja>
    </section>
  );
}
