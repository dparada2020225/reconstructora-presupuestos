import { useState } from "react";
import { PROVEEDORES_LECTOR } from "../../shared/lector";
import { Boton, Caja, Dialogo } from "../components/ui";
import type { FotosLeidas } from "./fotos";

/** Las fotos de la hoja y lo que hay que revisar, arriba del editor. */
export function PanelFotos({ fotos, avisos, proveedor, onOlvidar }: FotosLeidas & { onOlvidar?: () => void }) {
  const [abierto, setAbierto] = useState(true);
  const [grande, setGrande] = useState<number | null>(null);
  return (
    <Caja
      titulo={`Leído de ${fotos.length === 1 ? "la foto" : `${fotos.length} fotos`}`}
      accion={
        <div className="flex gap-1">
          <Boton variante="texto" onClick={() => setAbierto(!abierto)}>
            {abierto ? "Ocultar" : "Mostrar"}
          </Boton>
          {onOlvidar && (
            <Boton variante="texto" onClick={onOlvidar} title="Quitar las fotos de esta pantalla">
              Ya revisé
            </Boton>
          )}
        </div>
      }
    >
      {abierto ? (
        <div className="space-y-3">
          {avisos.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">Revisa antes de guardar:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {avisos.map((a, i) => (
                  <li key={i}>{a.texto}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Las sumas cuadran con los TOTAL escritos. Igual compara cada renglón con la foto.
            </p>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fotos.map((f, i) => (
              <button key={i} type="button" onClick={() => setGrande(i)} className="shrink-0 rounded border border-slate-200 hover:border-marca-600" title="Ver grande">
                <img src={f} alt={`Hoja ${i + 1}`} className="h-72 w-auto max-w-none rounded object-contain sm:h-96" />
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Leído con {PROVEEDORES_LECTOR[proveedor].nombre}. Las palabras con [?] no se entendieron bien. Las fotos no se guardan: solo se ven aquí mientras no recargues la página.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{avisos.length ? `${avisos.length} cosas por revisar.` : "Sin avisos."}</p>
      )}
      <Dialogo abierto={grande !== null} onCerrar={() => setGrande(null)} titulo={`Hoja ${(grande ?? 0) + 1} de ${fotos.length}`} ancho="max-w-5xl">
        {grande !== null && (
          <div className="space-y-2">
            <img src={fotos[grande]} alt={`Hoja ${grande + 1}`} className="w-full rounded" />
            {fotos.length > 1 && (
              <div className="flex justify-between">
                <Boton disabled={grande === 0} onClick={() => setGrande(grande - 1)}>
                  ← Anterior
                </Boton>
                <Boton disabled={grande === fotos.length - 1} onClick={() => setGrande(grande + 1)}>
                  Siguiente →
                </Boton>
              </div>
            )}
          </div>
        )}
      </Dialogo>
    </Caja>
  );
}
