import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { hoyGuatemala, type Ajustes } from "../../shared/presupuesto";
import { api, type PresupuestoDetalle, type TrabajoDetalle } from "../api";
import { Boton } from "../components/ui";

/**
 * "Ver PDF" (pestaña nueva) y "Descargar PDF". Si hay cambios, primero guarda.
 * El generador (pdf-lib) se carga solo la primera vez que se usa.
 */
export function AccionesPdf({ guardarAntes }: { id: number; guardarAntes: () => Promise<number | null>; sucio: boolean }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar(modo: "ver" | "descargar") {
    // La pestaña se abre YA (en el clic) para que el navegador no la bloquee.
    const ventana = modo === "ver" ? window.open("", "_blank") : null;
    setOcupado(true);
    setError(null);
    try {
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
      abrir(await pdf.generarPdf(datos), pdf.nombreArchivoPdf(datos), ventana);
    } catch (e) {
      ventana?.close();
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      {error && (
        <span role="alert" className="self-center text-sm text-red-700">
          {error}
        </span>
      )}
      <Boton disabled={ocupado} onClick={() => generar("ver")}>
        Ver PDF
      </Boton>
      <Boton disabled={ocupado} onClick={() => generar("descargar")}>
        {ocupado ? "Generando…" : "Descargar PDF"}
      </Boton>
    </>
  );
}

/**
 * Documento unificado del trabajo: original + todos los extras y el resumen al final.
 * Si el presupuesto abierto tiene cambios, primero se guardan.
 */
export function DocumentoUnificado({ trabajoId, guardarAntes }: { trabajoId: number; guardarAntes?: () => Promise<number | null> }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar(modo: "ver" | "descargar") {
    const ventana = modo === "ver" ? window.open("", "_blank") : null;
    setOcupado(true);
    setError(null);
    try {
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
        documentos: detalles.map((p) => ({ id: p.id, tipo: p.tipo, numero: p.numero, total: p.total, cerradoEn: p.cerradoEn, estado: p.estado, fecha: p.fecha, items: p.items })),
        abonado: t.abonado,
      };
      abrir(await pdf.generarPdfTrabajo(datos), pdf.nombreArchivoPdfTrabajo(datos), ventana);
    } catch (e) {
      ventana?.close();
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" className="flex-1" disabled={ocupado} onClick={() => generar("descargar")}>
          {ocupado ? "Generando…" : "Documento unificado (PDF)"}
        </Boton>
        <Boton disabled={ocupado} onClick={() => generar("ver")} title="Abrir en otra pestaña">
          Ver
        </Boton>
      </div>
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
