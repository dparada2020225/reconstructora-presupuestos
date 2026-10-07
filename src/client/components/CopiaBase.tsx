import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { CopiaBase, NombreTabla } from "../../db/copia-base";
import { hoyGuatemala } from "../../shared/presupuesto";
import { api, enviar } from "../api";
import { Aviso, Boton, Caja } from "./ui";

interface Resumen {
  tablas: { nombre: NombreTabla; filas: number }[];
  migraciones: number | null;
  porPagina: number;
  ultima: string | null;
}

/** Días para el recordatorio en Inicio. */
export const DIAS_RECORDATORIO = 30;
const diasDesde = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);

function haceCuanto(iso: string | null) {
  const d = diasDesde(iso);
  if (d === null) return "Nunca se ha descargado una copia.";
  const fecha = new Date(iso!).toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric" });
  return `Última copia: ${fecha} (${d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`}).`;
}

/** Ajustes → descargar TODA la base en un JSON (el navegador la pide tabla por tabla, de a páginas). */
export function CopiaBaseAjustes() {
  const qc = useQueryClient();
  const resumen = useQuery({ queryKey: ["copia-base"], queryFn: () => api<Resumen>("/copia-base") });
  const [progreso, setProgreso] = useState<string | null>(null);
  // Desde el recordatorio de Inicio se llega con #copia.
  useEffect(() => {
    if (location.hash === "#copia") document.getElementById("copia")?.scrollIntoView({ block: "center" });
  }, []);

  const descargar = useMutation({
    mutationFn: async () => {
      const r = await qc.fetchQuery({ queryKey: ["copia-base"], queryFn: () => api<Resumen>("/copia-base"), staleTime: 0 });
      const total = r.tablas.reduce((s, t) => s + t.filas, 0);
      let hechas = 0;
      const tablas = {} as CopiaBase["tablas"];
      for (const t of r.tablas) {
        tablas[t.nombre] = [];
        for (let p = 0; p * r.porPagina < t.filas; p++) {
          setProgreso(`Copiando ${t.nombre}… ${Math.round((hechas / Math.max(total, 1)) * 100)}%`);
          const { filas } = await api<{ filas: Record<string, unknown>[] }>(`/copia-base/${t.nombre}?pagina=${p}`);
          tablas[t.nombre].push(...filas);
          hechas += filas.length;
        }
      }
      const copia: CopiaBase = { app: "reconstructora-presupuestos", version: 1, creada: new Date().toISOString(), migraciones: r.migraciones, tablas };
      const url = URL.createObjectURL(new Blob([JSON.stringify(copia)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `copia-base-${hoyGuatemala()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return enviar<{ ultima: string }>("POST", "/copia-base/hecha");
    },
    onSuccess: ({ ultima }) => {
      qc.setQueryData<Resumen>(["copia-base"], (r) => (r ? { ...r, ultima } : r));
      qc.setQueryData(["copia-base-ultima"], { ultima });
    },
    onSettled: () => setProgreso(null),
  });

  const r = resumen.data;
  const filas = r?.tablas.reduce((s, t) => s + t.filas, 0) ?? 0;
  return (
    <Caja titulo="Copia de toda la base">
      <div id="copia" className="space-y-2 text-sm">
        <p className="text-slate-600">
          Descarga en un archivo todo lo que hay en la app: presupuestos, trabajos, abonos, clientes, buses, productos, usuarios y ajustes. Guárdalo
          en tu compu o en tu Drive (no lo compartas: tiene datos del negocio). Conviene bajar una cada mes.
        </p>
        {r && (
          <p>
            {haceCuanto(r.ultima)} <span className="text-slate-500">· {filas.toLocaleString("es-GT")} registros en total.</span>
          </p>
        )}
        <Boton variante="primario" disabled={descargar.isPending || !r} onClick={() => descargar.mutate()}>
          {progreso ?? (descargar.isPending ? "Preparando…" : "Descargar copia (.json)")}
        </Boton>
        {(descargar.error || resumen.error) && <Aviso>{(descargar.error ?? resumen.error)!.message}</Aviso>}
        <p className="text-xs text-slate-500">
          Para volver a cargar una copia se usa <code className="rounded bg-slate-100 px-1">npm run db:restaurar -- archivo.json</code> (ver
          DESPLIEGUE.md).
        </p>
      </div>
    </Caja>
  );
}

/** Inicio (solo admin): recordatorio si hace más de un mes que no se baja una copia. */
export function RecordatorioCopia() {
  const q = useQuery({ queryKey: ["copia-base-ultima"], queryFn: () => api<{ ultima: string | null }>("/copia-base/ultima") });
  if (!q.data) return null;
  const d = diasDesde(q.data.ultima);
  if (d !== null && d < DIAS_RECORDATORIO) return null;
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {d === null ? "Todavía no has descargado una copia de la base." : `Hace ${d} días que no descargas una copia de la base.`}{" "}
      <Link to="/ajustes#copia" className="font-medium underline">
        Descargar ahora
      </Link>
    </p>
  );
}
