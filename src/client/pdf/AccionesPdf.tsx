import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Ajustes } from "../../shared/presupuesto";
import { api, type PresupuestoDetalle } from "../api";
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
      const bytes = await pdf.generarPdf(datos);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      if (ventana) ventana.location.href = url;
      else {
        const a = document.createElement("a");
        a.href = url;
        a.download = pdf.nombreArchivoPdf(datos);
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
