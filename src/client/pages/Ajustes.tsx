import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IMAGENES_AJUSTES, type Ajustes as TAjustes } from "../../shared/presupuesto";
import { api, enviar, type Usuario } from "../api";
import { Aviso, Boton, Caja, Campo, claseInput, Encabezado } from "../components/ui";

/** Achica la imagen (máx. `maxAncho` px de ancho) y la devuelve como PNG en data URL. */
async function imagenComoDataUrl(archivo: File, maxAncho: number): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la imagen"));
      i.src = url;
    });
    const escala = Math.min(1, maxAncho / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CAMPOS: { clave: Exclude<keyof TAjustes, (typeof IMAGENES_AJUSTES)[number]>; etiqueta: string; ayuda?: string; largo?: boolean }[] = [
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

/** Vista previa + subir / cambiar / quitar una imagen del membrete. */
function CampoImagen({ valor, maxAncho, alt, altoVista, onChange }: { valor: string; maxAncho: number; alt: string; altoVista: string; onChange: (v: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      {valor ? (
        <img src={valor} alt={alt} className={`${altoVista} max-w-full rounded border border-slate-100 bg-white object-contain p-1`} />
      ) : (
        <p className="text-sm text-slate-500">Sin imagen.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
          {valor ? "Cambiar" : "Subir"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setError(null);
                const v = await imagenComoDataUrl(f, maxAncho);
                if (v.length > 700_000) throw new Error("La imagen sigue muy pesada; prueba con una más pequeña.");
                onChange(v);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        {valor && (
          <Boton variante="texto" onClick={() => onChange("")}>
            Quitar
          </Boton>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">PNG o JPG. Se achica solo a {maxAncho} px de ancho.</p>
      {error && <div className="mt-2"><Aviso>{error}</Aviso></div>}
    </div>
  );
}

function FormAjustes({ inicial, onGuardado }: { inicial: TAjustes; onGuardado: (a: TAjustes) => void }) {
  const [d, setD] = useState(inicial);
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
        <div className="space-y-4">
          <Caja titulo="Logo">
            <CampoImagen valor={d.logo} maxAncho={800} alt="Logo actual" altoVista="max-h-28" onChange={(logo) => setD({ ...d, logo })} />
          </Caja>
          <Caja titulo="Íconos de redes">
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Junto al nombre de la empresa</p>
                <CampoImagen valor={d.iconosEmpresa} maxAncho={400} alt="Íconos junto a la empresa" altoVista="max-h-8" onChange={(iconosEmpresa) => setD({ ...d, iconosEmpresa })} />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Junto al teléfono</p>
                <CampoImagen valor={d.iconosTelefono} maxAncho={200} alt="Ícono junto al teléfono" altoVista="max-h-8" onChange={(iconosTelefono) => setD({ ...d, iconosTelefono })} />
              </div>
              <p className="text-xs text-slate-500">Una sola imagen por renglón (p. ej. Instagram, TikTok y Facebook juntos). Salen en el PDF a la derecha del texto.</p>
            </div>
          </Caja>
        </div>
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
