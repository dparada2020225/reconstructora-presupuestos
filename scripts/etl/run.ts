/**
 * Lee los Excel históricos y genera, FUERA del repo (ETL_OUT_DIR):
 *   - historico.json   → lo que se carga a la base con `npm run etl:load`
 *   - revision.md      → decisiones y dudas para revisar a mano
 *   - estadisticas.md  → números rápidos para validar
 *
 * Uso: npm run etl:parse
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agrupar } from "./agrupar";
import { estadisticasMarkdown } from "./estadisticas";
import { abrirLibro } from "./excel";
import { parseNuevo } from "./parse-nuevo";
import { parseViejo } from "./parse-viejo";
import { reporteRevision } from "./reporte";
import { ARCHIVO_NUEVO, ARCHIVO_VIEJO, HISTORICO_JSON, OUT_DIR, leerOverrides, verificarFueraDelRepo } from "./rutas";
import type { DocCrudo } from "./tipos";

verificarFueraDelRepo();

const docs: DocCrudo[] = [];
for (const [ruta, parser] of [
  [ARCHIVO_VIEJO(), parseViejo],
  [ARCHIVO_NUEVO(), parseNuevo],
] as const) {
  if (!existsSync(ruta)) {
    console.warn(`⚠ No existe ${ruta}, se omite.`);
    continue;
  }
  const leidos = parser(await abrirLibro(ruta));
  console.log(`✓ ${leidos.length} documentos en ${ruta}`);
  docs.push(...leidos);
}
if (!docs.length) {
  console.error("No se leyó ningún documento. Revisa DATA_DIR en .env");
  process.exit(1);
}

const resultado = agrupar(docs, leerOverrides());
const h = resultado.historico;

writeFileSync(HISTORICO_JSON(), JSON.stringify(h, null, 2));
writeFileSync(join(OUT_DIR, "revision.md"), reporteRevision(resultado));
writeFileSync(join(OUT_DIR, "estadisticas.md"), estadisticasMarkdown(h));

console.log(
  `✓ ${h.trabajos.length} trabajos · ${h.trabajos.reduce((s, t) => s + t.presupuestos.length, 0)} presupuestos · ${h.clientes.length} clientes · ${h.buses.length} buses · ${h.productos.length} productos`,
);
console.log(`→ Resultados en ${OUT_DIR} (revision.md, estadisticas.md, historico.json)`);
