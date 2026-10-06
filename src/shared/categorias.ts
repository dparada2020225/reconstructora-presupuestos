import { normalizar } from "./texto";

/** Categoría a partir del nombre de la sección del presupuesto ("ADENTRO", "TROMPA"…). */
export function categoriaDeSeccion(seccion: string | null): string | null {
  if (!seccion) return null;
  const s = normalizar(seccion);
  const reglas: [RegExp, string][] = [
    [/adentro/, "ADENTRO"],
    [/afuera/, "AFUERA"],
    [/trompa|persiana|bomper|silvin/, "TROMPA"],
    [/audio/, "AUDIO"],
    [/luces|luz/, "LUCES"],
    [/electric/, "ELÉCTRICO"],
    [/accesorio/, "ACCESORIOS"],
    [/mecanica|tren/, "MECÁNICA"],
    [/silla/, "SILLAS"],
    [/adorno|cromad/, "CROMOS"],
  ];
  for (const [re, cat] of reglas) if (re.test(s)) return cat;
  return null;
}
