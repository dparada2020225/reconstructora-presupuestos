import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { hoyGuatemala, mensajeCompartir, type Ajustes } from "../../shared/presupuesto";
import { api, type PresupuestoDetalle, type TrabajoDetalle } from "../api";
import { Boton } from "../components/ui";

type Modo = "ver" | "descargar" | "compartir";
interface PdfListo {
  bytes: Uint8Array;
  nombre: string;
  mensaje: string;
}

/**
 * ¿El navegador puede compartir archivos? (menú de compartir del celular, o de Windows en Chrome/Edge:
 * ahí sale WhatsApp si está instalada la app). Si no, el botón "Compartir" no se muestra.
 */
export const puedeCompartirPdf = (() => {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [new File([new Uint8Array(1)], "p.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
})();

/**
 * Lógica común de los botones de PDF: genera, y luego abre, descarga o comparte.
 * El menú de compartir exige que venga "de un clic reciente"; si generar tardó demasiado y el
 * navegador lo rechaza, queda el archivo listo y se muestra "Toca para compartir" (un clic más).
 */
function usePdf(armar: () => Promise<PdfListo>) {
  const [ocupado, setOcupado] = useState<Modo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<PdfListo | null>(null);

  async function compartir(pdf: PdfListo) {
    try {
      const archivo = new File([pdf.bytes as BlobPart], pdf.nombre, { type: "application/pdf" });
      await navigator.share({ files: [archivo], title: pdf.mensaje, text: pdf.mensaje });
      setPendiente(null);
    } catch (e) {
      const nombre = (e as Error).name;
      if (nombre === "AbortError") setPendiente(null); // canceló el menú: no es error
      else if (nombre === "NotAllowedError") setPendiente(pdf);
      else {
        setPendiente(null);
        setError(`No se pudo compartir: ${(e as Error).message}`);
      }
    }
  }

  async function generar(modo: Modo) {
    // La pestaña se abre YA (en el clic) para que el navegador no la bloquee.
    const ventana = modo === "ver" ? window.open("", "_blank") : null;
    setOcupado(modo);
    setError(null);
    setPendiente(null);
    try {
      const pdf = await armar();
      if (modo === "compartir") await compartir(pdf);
      else abrir(pdf.bytes, pdf.nombre, ventana);
    } catch (e) {
      ventana?.close();
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return { ocupado, error, pendiente, generar, compartirPendiente: () => pendiente && compartir(pendiente) };
}

/** Botón "Toca para compartir" cuando el navegador pidió un clic más. */
function CompartirPendiente({ onClick }: { onClick: () => void }) {
  return (
    <Boton variante="primario" onClick={onClick}>
      PDF listo · Toca para compartir
    </Boton>
  );
}

/**
 * "Ver PDF" (pestaña nueva), "Descargar PDF" y "Compartir" (WhatsApp, correo…). Si hay cambios, primero guarda.
 * El generador (pdf-lib) se carga solo la primera vez que se usa.
 */
export function AccionesPdf({ guardarAntes }: { id: number; guardarAntes: () => Promise<number | null>; sucio: boolean }) {
  const qc = useQueryClient();
  const { ocupado, error, pendiente, generar, compartirPendiente } = usePdf(async () => {
    const id = await guardarAntes();
    if (!id) throw new Error("Revisa el presupuesto: hay datos incompletos.");
    const [p, ajustes, pdf] = await Promise.all([
      qc.fetchQuery({ queryKey: ["presupuesto", id], queryFn: () => api<PresupuestoDetalle>(`/presupuestos/${id}`), staleTime: 0 }),
      qc.fetchQuery({ queryKey: ["configuracion"], queryFn: () => api<Ajustes>("/configuracion") }),
      import("../../shared/pdf-presupuesto"),
    ]);
    const datos = {
      ajustes,
      id: p.id,
      tipo: p.tipo,
      numero: p.numero,
      cliente: p.trabajo.cliente,
      placa: p.trabajo.placa,
      bus: p.trabajo.bus,
      fecha: p.fecha,
      lugar: p.lugar,
      items: p.items,
      total: p.total,
      cerradoEn: p.cerradoEn,
      anticipo: p.anticipo,
      notaPie: p.notaPie,
      documentosTrabajo: p.hermanos,
    };
    return { bytes: await pdf.generarPdf(datos), nombre: pdf.nombreArchivoPdf(datos), mensaje: mensajeCompartir(datos) };
  });

  // Ctrl+P en el editor abre el PDF (lo que se imprime es el PDF, no la pantalla).
  const generarRef = useRef(generar);
  generarRef.current = generar;
  const ocupadoRef = useRef(ocupado);
  ocupadoRef.current = ocupado;
  useEffect(() => {
    const atajo = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === "p") {
        ev.preventDefault();
        if (!ocupadoRef.current && !document.querySelector("dialog[open]")) void generarRef.current("ver");
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, []);

  return (
    <>
      {error && (
        <span role="alert" className="self-center text-sm text-red-700">
          {error}
        </span>
      )}
      {pendiente ? (
        <CompartirPendiente onClick={() => void compartirPendiente()} />
      ) : (
        <>
          <Boton disabled={!!ocupado} onClick={() => generar("ver")} title="Ctrl+P" aria-keyshortcuts="Control+P">
            Ver PDF
          </Boton>
          <Boton disabled={!!ocupado} onClick={() => generar("descargar")}>
            {ocupado === "descargar" ? "Generando…" : "Descargar PDF"}
          </Boton>
          {puedeCompartirPdf && (
            <Boton disabled={!!ocupado} onClick={() => generar("compartir")} title="Mandar el PDF por WhatsApp, correo…">
              {ocupado === "compartir" ? "Generando…" : "Compartir"}
            </Boton>
          )}
        </>
      )}
    </>
  );
}

/**
 * Documento unificado del trabajo: original + todos los extras y el resumen al final.
 * Si el presupuesto abierto tiene cambios, primero se guardan.
 */
export function DocumentoUnificado({ trabajoId, guardarAntes }: { trabajoId: number; guardarAntes?: () => Promise<number | null> }) {
  const qc = useQueryClient();
  const { ocupado, error, pendiente, generar, compartirPendiente } = usePdf(async () => {
    if (guardarAntes && !(await guardarAntes())) throw new Error("Revisa el presupuesto: hay datos incompletos.");
    const [t, ajustes, pdf] = await Promise.all([
      qc.fetchQuery({ queryKey: ["trabajo", trabajoId], queryFn: () => api<TrabajoDetalle>(`/trabajos/${trabajoId}`), staleTime: 0 }),
      qc.fetchQuery({ queryKey: ["configuracion"], queryFn: () => api<Ajustes>("/configuracion") }),
      import("../../shared/pdf-presupuesto"),
    ]);
    const detalles = await Promise.all(
      t.presupuestos
        .filter((p) => p.estado !== "cancelado")
        .map((p) => qc.fetchQuery({ queryKey: ["presupuesto", p.id], queryFn: () => api<PresupuestoDetalle>(`/presupuestos/${p.id}`), staleTime: 0 })),
    );
    const datos = {
      ajustes,
      cliente: t.cliente,
      placa: t.placa,
      bus: t.bus,
      lugar: detalles.find((p) => p.tipo === "original")?.lugar ?? detalles[0]?.lugar ?? ajustes.lugar,
      fecha: hoyGuatemala(),
      documentos: detalles.map((p) => ({ id: p.id, tipo: p.tipo, numero: p.numero, total: p.total, cerradoEn: p.cerradoEn, anticipo: p.anticipo, estado: p.estado, fecha: p.fecha, items: p.items })),
    };
    return { bytes: await pdf.generarPdfTrabajo(datos), nombre: pdf.nombreArchivoPdfTrabajo(datos), mensaje: mensajeCompartir({ ...datos, unificado: true }) };
  });

  return (
    <div className="space-y-1">
      {pendiente ? (
        <div className="flex">
          <CompartirPendiente onClick={() => void compartirPendiente()} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Boton variante="primario" className="flex-1" disabled={!!ocupado} onClick={() => generar("descargar")}>
            {ocupado === "descargar" ? "Generando…" : "Documento unificado (PDF)"}
          </Boton>
          <Boton disabled={!!ocupado} onClick={() => generar("ver")} title="Abrir en otra pestaña">
            Ver
          </Boton>
          {puedeCompartirPdf && (
            <Boton disabled={!!ocupado} onClick={() => generar("compartir")} title="Mandar el documento por WhatsApp, correo…">
              {ocupado === "compartir" ? "Generando…" : "Compartir"}
            </Boton>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">Original y todos los extras en un solo PDF, con el resumen al final.</p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Abre el PDF en la pestaña ya abierta o lo descarga. */
function abrir(bytes: Uint8Array, nombre: string, ventana: Window | null) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  if (ventana) ventana.location.href = url;
  else {
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
