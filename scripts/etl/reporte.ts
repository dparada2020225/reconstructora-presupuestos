import type { ResultadoAgrupacion } from "./agrupar";

const q = (n: number | null) => (n === null ? "—" : `Q${Math.round(n).toLocaleString("en-US")}`);

/** Reporte para revisar a mano lo que el ETL decidió. Se escribe FUERA del repo. */
export function reporteRevision(r: ResultadoAgrupacion): string {
  const h = r.historico;
  const L: string[] = [];
  L.push("# Revisión de la migración de presupuestos", "");
  L.push(
    "Este archivo es para revisar a mano. Si algo está mal, corrígelo en `overrides.json` (misma carpeta que los Excel) y vuelve a correr `npm run etl:parse`.",
    "",
  );
  L.push(
    `Documentos leídos: **${r.docs.length}** · Trabajos: **${h.trabajos.length}** · Presupuestos: **${h.trabajos.reduce((s, t) => s + t.presupuestos.length, 0)}** · Clientes: **${h.clientes.length}** · Buses: **${h.buses.length}** · Productos en catálogo: **${h.productos.length}**`,
    "",
  );

  L.push("## 1. Diferencias y avisos por documento", "");
  const conAvisos = r.docs.filter((d) => d.avisos.length);
  if (!conAvisos.length) L.push("Ninguno.");
  for (const d of conAvisos) {
    L.push(`- **${d.ref}**`);
    for (const a of d.avisos) L.push(`  - ${a}`);
  }
  L.push("");

  L.push("## 2. Decisiones automáticas", "");
  const tipos: Record<string, string> = {
    "version-duplicada": "Versiones repetidas (se ignoró la anterior)",
    "unidas-mismo-dia": "Pestañas/bloques unidos en un solo presupuesto",
    "extra-inferido": "Tomados como EXTRA sin decirlo (mismo cliente, pocos días después)",
    "extra-sin-original": "Dicen EXTRA pero no se encontró el original",
    "seccion-extra-separada": "Secciones EXTRAS separadas como presupuesto extra",
  };
  for (const [tipo, titulo] of Object.entries(tipos)) {
    const ds = r.decisiones.filter((d) => d.tipo === tipo);
    if (!ds.length) continue;
    L.push(`### ${titulo} (${ds.length})`, "");
    for (const d of ds) L.push(`- ${d.detalle}`);
    L.push("");
  }

  L.push("## 3. Clientes", "");
  L.push("### Escrituras distintas que se tomaron como el mismo cliente", "");
  for (const [clave, vs] of r.variantesClientes) if (vs.size > 1) L.push(`- \`${clave}\` ← ${[...vs].map((v) => `"${v}"`).join(", ")}`);
  L.push("", "### Posibles duplicados (NO se fusionaron; decide tú)", "");
  if (!r.sugerenciasClientes.length) L.push("Ninguno.");
  for (const s of r.sugerenciasClientes) L.push(`- \`${s.a}\` ↔ \`${s.b}\` (${Math.round(s.similitud * 100)}%, ${s.motivo})`);
  L.push(
    "",
    'Para fusionar: en `overrides.json` → `"clientes": { "clave que sobra": "Nombre correcto" }`.',
    "",
  );

  L.push("## 4. Trabajos armados", "");
  const porCliente = new Map<string, typeof h.trabajos>();
  for (const t of h.trabajos) porCliente.set(t.cliente, [...(porCliente.get(t.cliente) ?? []), t]);
  for (const [cliente, ts] of [...porCliente.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    L.push(`### ${cliente}`, "");
    for (const t of ts) {
      const bus = t.bus ? [t.bus.placa, t.bus.nombre].filter(Boolean).join(" · ") : "sin bus";
      L.push(
        `- **Trabajo ${t.fechaInicio ?? "s/f"}** — ${bus}${t.precioCerrado ? ` — cerrado en ${q(t.precioCerrado)}` : ""} — clave \`${t.clave}\``,
      );
      for (const p of t.presupuestos) {
        L.push(
          `  - ${p.tipo === "original" ? "Original" : `Extra ${p.numero}`} · ${p.fecha ?? "s/f"} · ${q(p.total)} · ${p.items.length} líneas · ${p.origenRefs.join(" + ")}`,
        );
      }
    }
    L.push("");
  }

  L.push("## 5. Buses", "", "| Cliente | Placa | Nombre |", "|---|---|---|");
  for (const b of [...h.buses].sort((a, c) => a.cliente.localeCompare(c.cliente))) L.push(`| ${b.cliente} | ${b.placa ?? "—"} | ${b.nombre ?? "—"} |`);
  L.push("");

  L.push("## 6. Catálogo de productos propuesto (aparecen 2+ veces)", "", "| Producto | Categoría | Veces | Variantes |", "|---|---|---|---|");
  for (const p of h.productos) L.push(`| ${p.nombre} | ${p.categoria ?? "—"} | ${p.veces} | ${p.alias.slice(0, 6).join(" · ")}${p.alias.length > 6 ? " …" : ""} |`);
  L.push(
    "",
    'Para unir productos: `"productos": { "variante": "Nombre del producto" }` en `overrides.json`.',
    "",
  );

  L.push("## 7. Ejemplo de overrides.json", "", "```json", JSON.stringify(EJEMPLO_OVERRIDES, null, 2), "```", "");
  return L.join("\n");
}

export const EJEMPLO_OVERRIDES = {
  clientes: { "jose peres": "José Pérez" },
  clientePorDoc: { "PRESUPUESTO.xlsx › NOMBRE PESTAÑA": "Nombre correcto del cliente" },
  buses: { "la estrella": "Estrella" },
  productos: { "pintura afuera poliuretano": "Pintura afuera (poliuretano)" },
  trabajoPorDoc: {
    "PRESUPUESTO.xlsx › PESTAÑA A": "trabajo-x",
    "PRESUPUESTO.xlsx › PESTAÑA B": "trabajo-x",
  },
  tipoPorDoc: { "PRESUPUESTO.xlsx › PESTAÑA B": "extra" },
  ignorar: ["PRESUPUESTO.xlsx › PESTAÑA DE PRUEBA"],
  noConcretados: ["PRESUPUESTO.xlsx › PESTAÑA QUE NO SE HIZO"],
};
