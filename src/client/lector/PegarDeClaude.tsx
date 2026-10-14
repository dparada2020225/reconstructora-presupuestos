import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { extraerJson, normalizarLectura } from "../../shared/lector";
import { api, type BusFila, type ClienteFila } from "../api";
import { Aviso, Boton, Caja, claseInput, Encabezado } from "../components/ui";
import { Editor, type ContextoEditor } from "../editor/Editor";
import type { EditorEstado } from "../editor/modelo";
import { estadoDesdeLectura, type ResultadoLectura } from "./desdeLectura";
import { recordarFotos, type FotosLeidas } from "./fotos";
import { PanelFotos } from "./PanelFotos";

const ORIGEN = "Claude (texto pegado)";

/**
 * /presupuestos/nuevo?modo=pegar — el texto que devuelve la skill /presupuestos de Claude cuando
 * no puede entrar a la app (p. ej. desde el teléfono): el mismo JSON que da el lector de fotos.
 * Se lee aquí mismo en el navegador, sin llamar a ninguna IA.
 */
export function PegarDeClaude({ base, ctx, volver }: { base: EditorEstado; ctx: ContextoEditor; volver: { to: string; texto: string } }) {
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => api<ClienteFila[]>("/clientes") });
  const buses = useQuery({ queryKey: ["buses"], queryFn: () => api<BusFila[]>("/buses") });
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLectura | null>(null);

  const abrir = (t = texto) => {
    setError(null);
    try {
      const lectura = normalizarLectura(extraerJson(t));
      if (!lectura.secciones.length) throw new Error("El texto no trae ningún renglón");
      setResultado(estadoDesdeLectura(base, lectura, { origen: ORIGEN, esExtra: !!ctx.trabajoId, clientes: clientes.data ?? [], buses: buses.data ?? [] }));
    } catch (e) {
      setError(`${(e as Error).message}. Copia todo el bloque que te dio Claude (desde la primera { hasta la última }).`);
    }
  };
  const pegar = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setTexto(t);
      if (t.trim()) abrir(t);
    } catch {
      setError("El navegador no dejó leer lo copiado. Mantén presionado el cuadro y escoge Pegar.");
    }
  };

  if (resultado) {
    const panel: FotosLeidas = { fotos: [], avisos: resultado.avisos, origen: ORIGEN };
    return (
      <Editor
        key={`pegado-${resultado.inicial.secciones[0]?.key}`}
        inicial={resultado.inicial}
        ctx={ctx}
        panel={<PanelFotos {...panel} />}
        nombreClienteNuevo={resultado.clienteEscrito ?? ""}
        nuevos={resultado.nuevos}
        alGuardarNuevo={(id) => recordarFotos(id, panel)}
        accionExtra={
          <Boton variante="texto" onClick={() => setResultado(null)} title="Volver al texto (se pierde lo que cambiaste aquí)">
            Pegar otra vez
          </Boton>
        }
      />
    );
  }

  const titulo = ctx.trabajoId ? `Nuevo extra · ${ctx.trabajo?.cliente ?? ""}` : "Pegar presupuesto de Claude";
  return (
    <section className="space-y-4">
      <Encabezado titulo={titulo} volver={volver} />
      <Caja>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Pega aquí el bloque de texto que te dio Claude con <code className="rounded bg-slate-100 px-1">/presupuestos</code>. Se abre el presupuesto lleno para
            revisarlo antes de guardarlo.
          </p>
          <textarea
            className={`${claseInput} h-48 font-mono text-xs`}
            placeholder='{"cliente": "…", "secciones": [ … ] }'
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Texto de Claude"
          />
          <div className="flex flex-wrap gap-2">
            <Boton variante="primario" className="px-4 py-2" disabled={!texto.trim()} onClick={() => abrir()}>
              Abrir en el editor
            </Boton>
            {"clipboard" in navigator && (
              <Boton className="py-2" onClick={pegar}>
                Pegar lo copiado
              </Boton>
            )}
          </div>
          {error && <Aviso>{error}</Aviso>}
        </div>
      </Caja>
    </section>
  );
}
