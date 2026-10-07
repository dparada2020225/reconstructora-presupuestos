import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Ajustes as TAjustes } from "../../shared/presupuesto";
import { api, enviar, type Usuario } from "../api";
import { Aviso, Boton, Caja, Campo, claseInput, Encabezado } from "../components/ui";

/** Achica la imagen (máx. 800 px de ancho) y la devuelve como PNG en data URL. */
async function logoComoDataUrl(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la imagen"));
      i.src = url;
    });
    const escala = Math.min(1, 800 / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CAMPOS: { clave: Exclude<keyof TAjustes, "logo">; etiqueta: string; ayuda?: string; largo?: boolean }[] = [
  { clave: "empresa", etiqueta: "Nombre de la empresa" },
  { clave: "correo", etiqueta: "Correo" },
  { clave: "telefono", etiqueta: "Teléfono" },
  { clave: "firma", etiqueta: "Firma", ayuda: "El nombre que va al final del PDF." },
  { clave: "lugar", etiqueta: "Lugar por defecto", ayuda: "Se pone solo en cada presupuesto nuevo." },
  { clave: "nota", etiqueta: "Nota al pie", largo: true },
];

/** Membrete del PDF. Vive en la base (no en el código) porque el repositorio es público. */
export function Ajustes() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });
  const q = useQuery({ queryKey: ["configuracion"], queryFn: () => api<TAjustes>("/configuracion") });
  if (me.data && me.data.rol !== "admin") return <p className="text-slate-600">Solo el administrador puede cambiar los ajustes.</p>;
  if (!q.data) return q.error ? <Aviso>{q.error.message}</Aviso> : <p className="text-slate-500">Cargando…</p>;
  return (
    <div className="space-y-4">
      <FormAjustes key={JSON.stringify(q.data)} inicial={q.data} onGuardado={(a) => qc.setQueryData(["configuracion"], a)} />
      <RespaldoAjustes />
    </div>
  );
}

/** Estado del respaldo en Google Sheets y botón para copiar los pendientes. */
function RespaldoAjustes() {
  const qc = useQueryClient();
  const estado = useQuery({ queryKey: ["respaldo"], queryFn: () => api<{ configurado: boolean; pendientes: number }>("/configuracion/respaldo") });
  const [errores, setErrores] = useState<string[]>([]);
  const copiar = useMutation({
    mutationFn: async () => {
      setErrores([]);
      // De a 5 por vuelta, hasta terminar o hasta que algo falle.
      for (let vuelta = 0; vuelta < 40; vuelta++) {
        const r = await enviar<{ hechos: number; errores: string[]; pendientes: number }>("POST", "/configuracion/respaldo/pendientes");
        qc.setQueryData(["respaldo"], { configurado: true, pendientes: r.pendientes });
        if (r.errores.length) return setErrores(r.errores);
        if (!r.pendientes || !r.hechos) return;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["presupuesto"] }),
  });
  const rehacer = useMutation({
    mutationFn: () => enviar<{ configurado: boolean; pendientes: number }>("POST", "/configuracion/respaldo/rehacer"),
    onSuccess: (r) => qc.setQueryData(["respaldo"], r),
  });
  const d = estado.data;
  return (
    <Caja titulo="Respaldo en Google Sheets">
      {!d ? (
        <p className="text-sm text-slate-500">Revisando…</p>
      ) : !d.configurado ? (
        <p className="text-sm text-slate-600">
          Todavía no está configurado. Se configura con <code className="rounded bg-slate-100 px-1">npm run configurar:google</code> (ver DESPLIEGUE.md).
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-slate-600">
            Cada presupuesto que deja de ser borrador se copia solo a una pestaña del archivo de respaldo, con el formato de siempre.
          </p>
          <p>
            {d.pendientes ? (
              <>
                <b>{d.pendientes}</b> {d.pendientes === 1 ? "presupuesto tiene" : "presupuestos tienen"} cambios sin copiar.
              </>
            ) : (
              <span className="text-emerald-700">✓ Todo copiado.</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {d.pendientes > 0 && (
              <Boton variante="primario" disabled={copiar.isPending} onClick={() => copiar.mutate()}>
                {copiar.isPending ? "Copiando…" : "Copiar pendientes"}
              </Boton>
            )}
            <Boton variante="texto" disabled={rehacer.isPending || copiar.isPending} onClick={() => rehacer.mutate()} title="Vuelve a copiar todos los presupuestos de la app (reemplaza sus pestañas)">
              Volver a copiar todos
            </Boton>
          </div>
          {rehacer.error && <Aviso>{rehacer.error.message}</Aviso>}
          {copiar.error && <Aviso>{copiar.error.message}</Aviso>}
          {errores.map((e) => (
            <Aviso key={e}>{e}</Aviso>
          ))}
        </div>
      )}
    </Caja>
  );
}

function FormAjustes({ inicial, onGuardado }: { inicial: TAjustes; onGuardado: (a: TAjustes) => void }) {
  const [d, setD] = useState(inicial);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const cambiado = JSON.stringify(d) !== JSON.stringify(inicial);
  const guardar = useMutation({ mutationFn: () => enviar<TAjustes>("PUT", "/configuracion", d), onSuccess: onGuardado });

  return (
    <section className="space-y-4">
      <Encabezado titulo="Ajustes" detalle="Datos del membrete que salen en cada PDF." />
      <form
        className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <Caja titulo="Membrete">
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <Campo key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda} className={c.largo ? "sm:col-span-2" : ""}>
                {c.largo ? (
                  <textarea rows={2} maxLength={600} className={claseInput} value={d[c.clave]} onChange={(e) => setD({ ...d, [c.clave]: e.target.value })} />
                ) : (
                  <input maxLength={160} className={claseInput} value={d[c.clave]} onChange={(e) => setD({ ...d, [c.clave]: e.target.value })} />
                )}
              </Campo>
            ))}
          </div>
        </Caja>
        <Caja titulo="Logo">
          {d.logo ? (
            <img src={d.logo} alt="Logo actual" className="max-h-28 max-w-full rounded border border-slate-100 bg-white object-contain p-2" />
          ) : (
            <p className="text-sm text-slate-500">Sin logo.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
              {d.logo ? "Cambiar logo" : "Subir logo"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    setErrorLogo(null);
                    const logo = await logoComoDataUrl(f);
                    if (logo.length > 700_000) throw new Error("La imagen sigue muy pesada; prueba con una más pequeña.");
                    setD({ ...d, logo });
                  } catch (err) {
                    setErrorLogo((err as Error).message);
                  }
                }}
              />
            </label>
            {d.logo && (
              <Boton variante="texto" onClick={() => setD({ ...d, logo: "" })}>
                Quitar
              </Boton>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">PNG o JPG. Se achica solo a 800 px de ancho.</p>
          {errorLogo && <div className="mt-2"><Aviso>{errorLogo}</Aviso></div>}
        </Caja>
        <div className="flex items-center gap-3 lg:col-span-2">
          <Boton type="submit" variante="primario" disabled={!cambiado || guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar ajustes"}
          </Boton>
          {guardar.isSuccess && !cambiado && <span className="text-sm text-emerald-700">Guardado.</span>}
          {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
        </div>
      </form>
    </section>
  );
}
