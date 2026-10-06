/**
 * Neon entrega URLs con `channel_binding=require`. postgres-js (scripts y drizzle-kit)
 * manda cualquier parámetro desconocido al servidor y Postgres lo rechaza, así que
 * se quita aquí. El driver HTTP del Worker no lo necesita.
 */
export function urlParaScripts(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return url;
  }
}
