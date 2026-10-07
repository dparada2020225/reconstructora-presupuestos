import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, enviar, type EstadoPresupuesto } from "../api";
import { Boton } from "../components/ui";

const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" });
};

/** Estado del respaldo de este presupuesto en Google Sheets, con link y "Respaldar ahora". */
export function RespaldoSheets({
  id,
  estado,
  origen,
  sheetUrl,
  respaldadoEn,
  respaldoError,
  actualizadoEn,
}: {
  id: number;
  estado: EstadoPresupuesto;
  origen: "app" | "historico";
  sheetUrl: string | null;
  respaldadoEn: string | null;
  respaldoError: string | null;
  actualizadoEn: string;
}) {
  const qc = useQueryClient();
  const respaldar = useMutation({
    mutationFn: () => enviar<{ url: string }>("POST", `/presupuestos/${id}/respaldo`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["presupuesto", id] }),
  });
  if (origen === "historico") return <p className="text-xs text-slate-500">Del histórico: su respaldo es el Excel de siempre.</p>;

  const alDia = respaldadoEn && new Date(respaldadoEn) >= new Date(actualizadoEn);
  const noConfigurado = respaldar.error instanceof ApiError && respaldar.error.status === 503;
  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-xs font-medium text-slate-600">Respaldo en Google Sheets</p>
      {estado === "borrador" ? (
        <p className="text-xs text-slate-500">Se copia solo cuando deja de ser borrador.</p>
      ) : (
        <>
          {sheetUrl && (
            <p>
              <a href={sheetUrl} target="_blank" rel="noreferrer" className="text-marca-700 hover:underline">
                Abrir en Sheets ↗
              </a>
              {respaldadoEn && <span className={`ml-2 text-xs ${alDia ? "text-emerald-700" : "text-amber-700"}`}>{alDia ? `✓ al día · ${hace(respaldadoEn)}` : "tiene cambios sin copiar"}</span>}
            </p>
          )}
          {!sheetUrl && !respaldoError && <p className="text-xs text-slate-500">Todavía sin copiar.</p>}
          {respaldoError && !respaldar.isSuccess && <p className="text-xs text-red-700">No se pudo copiar: {respaldoError}</p>}
          {respaldar.error && <p className="text-xs text-red-700">{noConfigurado ? "El respaldo todavía no está configurado (ver Ajustes)." : respaldar.error.message}</p>}
          <Boton variante="texto" className="-ml-3" disabled={respaldar.isPending} onClick={() => respaldar.mutate()}>
            {respaldar.isPending ? "Copiando…" : sheetUrl ? "Volver a copiar ahora" : "Copiar ahora"}
          </Boton>
        </>
      )}
    </div>
  );
}
