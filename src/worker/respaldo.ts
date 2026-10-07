/**
 * Respaldo de cada presupuesto en Google Sheets, con el formato de siempre.
 *
 * Cómo funciona: en el Drive del admin hay UN archivo de Sheets compartido (Editor) con la
 * cuenta de servicio. Ese archivo tiene la pestaña plantilla "FORMATO" (la del Excel de siempre:
 * logo, membrete, líneas, TOTAL y nota). Por cada presupuesto se duplica esa pestaña y se llenan
 * las celdas. Si se vuelve a respaldar, la pestaña anterior se borra y se crea de nuevo.
 *
 * Secretos del Worker (y de .dev.vars en local): GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
 * SHEETS_RESPALDO_ID. Se ponen con `npm run configurar:google`.
 */
import { and, asc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Context } from "hono";
import { importPKCS8, SignJWT } from "jose";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";
import { lugarYFecha } from "../shared/presupuesto";
import { nombrePestana, renglonesRespaldo, type DatosRespaldo, type Renglon } from "../shared/respaldo";
import type { AppEnv, Env } from "./env";
import { leerAjustes } from "./ajustes";

type Fetch = typeof fetch;

/* Posiciones de la pestaña FORMATO (filas en base 1, como se ven en Sheets). Se detectan leyendo
   la plantilla ("Lugar y fecha:", "Cliente:", la primera línea "-", "TOTAL", "NOTA:"); estos son
   los valores del Excel de siempre, por si no se encuentran. */
const PLANTILLA = "FORMATO";
export interface Posiciones {
  lugar: number;
  cliente: number;
  placa: number;
  primera: number;
  ultima: number;
  nota: number;
  firma: number;
}
const POSICIONES_EXCEL: Posiciones = { lugar: 8, cliente: 10, placa: 12, primera: 16, ultima: 51, nota: 54, firma: 55 };

/** Ubica las filas en los valores de la plantilla (columnas A y B, desde la fila 1). */
export function detectarPosiciones(valores: string[][]): Posiciones {
  const p = { ...POSICIONES_EXCEL };
  const fila = (re: RegExp, col = 0, desde = 0) => {
    const i = valores.findIndex((r, n) => n >= desde && re.test(String(r[col] ?? "").trim()));
    return i < 0 ? null : i + 1;
  };
  const lugar = fila(/^lugar y fecha/i);
  const cliente = fila(/^cliente/i);
  const placa = fila(/^no\.? ?placa/i);
  if (lugar) p.lugar = lugar + 1;
  if (cliente) p.cliente = cliente + 1;
  if (placa) p.placa = placa + 1;
  const primera = fila(/^-$/, 0, (placa ?? 12) - 1);
  if (primera) p.primera = primera;
  const total = fila(/^total/i, 1, p.primera - 1);
  if (total) p.ultima = total;
  const nota = fila(/^nota/i, 0, p.ultima - 1);
  if (nota) {
    p.nota = nota;
    p.firma = nota + 1;
  }
  return p;
}

const VERDE = { red: 0x8c / 255, green: 0xda / 255, blue: 0x1f / 255 };
const PUNTOS = "…".repeat(80);

export const googleConfigurado = (env: Env) => !!(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.SHEETS_RESPALDO_ID);

/* ───────────── Token de la cuenta de servicio (se reusa ~1 hora) ───────────── */

let tokenCache: { token: string; vence: number; email: string } | null = null;

async function token(env: Env, f: Fetch): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.email === env.GOOGLE_SERVICE_ACCOUNT_EMAIL && tokenCache.vence > ahora + 60) return tokenCache.token;
  const llave = await importPKCS8(env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"), "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL!)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + 3600)
    .sign(llave);
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google no aceptó la cuenta de servicio: ${j.error_description ?? j.error ?? r.status}`);
  tokenCache = { token: j.access_token, vence: ahora + (j.expires_in ?? 3600), email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL! };
  return j.access_token;
}

async function google<T>(f: Fetch, tk: string, url: string, init?: RequestInit): Promise<T> {
  const r = await f(url, { ...init, headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", ...init?.headers } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Google Sheets: ${j.error?.message ?? r.status}`);
  return j;
}

let plantillaCache: { archivo: string; sheetId: number; pos: Posiciones } | null = null;

async function plantilla(f: Fetch, tk: string, archivo: string) {
  if (plantillaCache?.archivo === archivo) return plantillaCache;
  const api = `https://sheets.googleapis.com/v4/spreadsheets/${archivo}`;
  const j = await google<{ sheets: { properties: { sheetId: number; title: string } }[] }>(f, tk, `${api}?fields=sheets.properties(sheetId,title)`);
  const hoja = j.sheets.find((h) => h.properties.title.trim().toUpperCase() === PLANTILLA);
  if (!hoja) throw new Error(`El archivo de respaldo no tiene una pestaña llamada ${PLANTILLA}`);
  const titulo = `'${hoja.properties.title.replace(/'/g, "''")}'`;
  const v = await google<{ values?: string[][] }>(f, tk, `${api}/values/${encodeURIComponent(`${titulo}!A1:B120`)}`);
  plantillaCache = { archivo, sheetId: hoja.properties.sheetId, pos: detectarPosiciones(v.values ?? []) };
  return plantillaCache;
}

/* ───────────── Celdas ───────────── */

/** Texto que Sheets no debe interpretar como fórmula. */
const txt = (t: string) => (/^[=+\-@]/.test(t) ? `'${t}` : t);

/**
 * Suma de la columna D en las filas de líneas (items y sus detalles, que no tienen monto) entre
 * `desde` y `hasta`. Sin comas ni punto y coma: el separador de argumentos depende del idioma del
 * archivo (en español es ";"), así que solo se usan rangos y "+", que valen en cualquier idioma.
 */
function sumaLineas(lineas: number[], desde: number, hasta: number) {
  const tramos: [number, number][] = [];
  for (const f of lineas) {
    if (f < desde || f > hasta) continue;
    const ult = tramos.at(-1);
    if (ult && ult[1] === f - 1) ult[1] = f;
    else tramos.push([f, f]);
  }
  return tramos.length ? `=${tramos.map(([a, b]) => `SUM(D${a}:D${b})`).join("+")}` : 0;
}

/** Valores A:D de cada renglón + qué filas llevan formato especial. */
export function celdas(renglones: Renglon[], PRIMERA = POSICIONES_EXCEL.primera) {
  const filas: (string | number)[][] = [];
  const formatos: { fila: number; tipo: "titulo" | "verde" | "negrita" | "detalle" }[] = [];
  const lineas: number[] = [];
  let inicioSeccion = PRIMERA;
  renglones.forEach((r, i) => {
    const fila = PRIMERA + i;
    switch (r.tipo) {
      case "titulo":
        filas.push(["", txt(r.texto), "", ""]);
        formatos.push({ fila, tipo: "titulo" });
        inicioSeccion = fila + 1;
        break;
      case "item":
        filas.push(["'-", txt(`${r.texto}${PUNTOS}`), "", r.precio ?? ""]);
        lineas.push(fila);
        break;
      case "detalle":
        filas.push(["", txt(r.texto), "", ""]);
        formatos.push({ fila, tipo: "detalle" });
        lineas.push(fila);
        break;
      case "suma": {
        const desde = r.alcance === "todo" ? PRIMERA : inicioSeccion;
        filas.push(["", `${r.texto}${PUNTOS}`, "", sumaLineas(lineas, desde, fila - 1)]);
        formatos.push({ fila, tipo: "verde" });
        inicioSeccion = fila + 1;
        break;
      }
      case "monto":
        filas.push(["", txt(`${r.texto}${PUNTOS}`), "", r.monto]);
        if (r.resaltar) formatos.push({ fila, tipo: "verde" });
        else if (r.negrita) formatos.push({ fila, tipo: "negrita" });
        break;
      case "vacio":
        filas.push(["", "", "", ""]);
        inicioSeccion = fila + 1;
        break;
    }
  });
  return { filas, formatos };
}

/* ───────────── Datos del presupuesto ───────────── */

async function datos(db: Db, id: number) {
  const [p] = await db.select().from(s.presupuestos).where(eq(s.presupuestos.id, id));
  if (!p) throw new Error("Presupuesto no encontrado");
  const [items, [t], hermanos, ajustes] = await Promise.all([
    db.select().from(s.presupuestoItems).where(eq(s.presupuestoItems.presupuestoId, id)).orderBy(asc(s.presupuestoItems.orden), asc(s.presupuestoItems.id)),
    db
      .select({ cliente: s.clientes.nombre, bus: s.buses.nombre, placa: s.buses.placa })
      .from(s.trabajos)
      .innerJoin(s.clientes, eq(s.clientes.id, s.trabajos.clienteId))
      .leftJoin(s.buses, eq(s.buses.id, s.trabajos.busId))
      .where(eq(s.trabajos.id, p.trabajoId)),
    db
      .select({ id: s.presupuestos.id, tipo: s.presupuestos.tipo, numero: s.presupuestos.numero, total: s.presupuestos.total, cerradoEn: s.presupuestos.cerradoEn, estado: s.presupuestos.estado })
      .from(s.presupuestos)
      .where(eq(s.presupuestos.trabajoId, p.trabajoId)),
    leerAjustes(db),
  ]);
  const n = (x: string | null) => (x === null ? null : Number(x));
  const d: DatosRespaldo = {
    id: p.id,
    tipo: p.tipo,
    numero: p.numero,
    fecha: p.fecha,
    cliente: t.cliente,
    items: items.map((i) => ({ ...i, cantidad: Number(i.cantidad), precioUnitario: n(i.precioUnitario), precio: n(i.precio) })),
    total: Number(p.total ?? 0),
    cerradoEn: n(p.cerradoEn),
    anticipo: n(p.anticipo),
    documentosTrabajo: hermanos.map((h) => ({ ...h, total: Number(h.total ?? 0), cerradoEn: n(h.cerradoEn) })),
  };
  return { p, d, t, ajustes };
}

/* ───────────── Respaldar ───────────── */

/**
 * Copia el presupuesto a su pestaña de Sheets y guarda el link. Si falla, anota el error
 * en el presupuesto (se puede reintentar) y lo vuelve a lanzar.
 */
export async function respaldarPresupuesto(db: Db, env: Env, id: number, f: Fetch = fetch): Promise<string> {
  try {
    if (!googleConfigurado(env)) throw new Error("El respaldo en Google Sheets no está configurado");
    const archivo = env.SHEETS_RESPALDO_ID!;
    const { p, d, t, ajustes } = await datos(db, id);
    const tk = await token(env, f);
    const api = `https://sheets.googleapis.com/v4/spreadsheets/${archivo}`;
    const { sheetId: idPlantilla, pos } = await plantilla(f, tk, archivo);
    const { primera: PRIMERA, ultima: ULTIMA } = pos;

    // La pestaña anterior de este presupuesto (si la hay) se borra; si ya no existe, no pasa nada.
    const anterior = p.sheetUrl?.match(/[#&]gid=(\d+)/)?.[1];
    if (anterior && p.sheetUrl?.includes(archivo))
      await google(f, tk, `${api}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: Number(anterior) } }] }) }).catch(() => {});

    const nombre = nombrePestana(d);
    const dup = await google<{ replies: { duplicateSheet: { properties: { sheetId: number } } }[] }>(f, tk, `${api}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ duplicateSheet: { sourceSheetId: idPlantilla, insertSheetIndex: 1, newSheetName: nombre } }] }),
    });
    const hoja = dup.replies[0].duplicateSheet.properties.sheetId;

    const { filas, formatos } = celdas(renglonesRespaldo(d), PRIMERA);
    const capacidad = ULTIMA - PRIMERA + 1;
    const extra = Math.max(0, filas.length - capacidad);
    const ultima = ULTIMA + extra;
    const rango = (f1: number, f2: number, c1 = 0, c2 = 5) => ({ sheetId: hoja, startRowIndex: f1 - 1, endRowIndex: f2, startColumnIndex: c1, endColumnIndex: c2 });

    const requests: unknown[] = [];
    if (extra) requests.push({ insertDimension: { range: { sheetId: hoja, dimension: "ROWS", startIndex: ULTIMA - 1, endIndex: ULTIMA - 1 + extra }, inheritFromBefore: true } });
    requests.push(
      { unmergeCells: { range: rango(PRIMERA, ultima) } },
      {
        repeatCell: {
          range: rango(PRIMERA, ultima),
          cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { bold: false, italic: false }, horizontalAlignment: "LEFT" } },
          fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.horizontalAlignment",
        },
      },
      { repeatCell: { range: rango(PRIMERA, ultima, 3, 4), cell: { userEnteredFormat: { horizontalAlignment: "RIGHT" } }, fields: "userEnteredFormat.horizontalAlignment" } },
    );
    for (const fm of formatos) {
      if (fm.tipo === "titulo")
        requests.push(
          { mergeCells: { range: rango(fm.fila, fm.fila, 1, 3), mergeType: "MERGE_ALL" } },
          {
            repeatCell: {
              range: rango(fm.fila, fm.fila, 1, 3),
              cell: { userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: "CENTER" } },
              fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.horizontalAlignment",
            },
          },
        );
      else if (fm.tipo === "verde")
        requests.push({
          repeatCell: {
            range: rango(fm.fila, fm.fila, 1, 4),
            cell: { userEnteredFormat: { backgroundColor: VERDE, textFormat: { bold: true } } },
            fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold",
          },
        });
      else if (fm.tipo === "negrita")
        requests.push({ repeatCell: { range: rango(fm.fila, fm.fila, 1, 4), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } });
      else
        requests.push({ repeatCell: { range: rango(fm.fila, fm.fila, 1, 2), cell: { userEnteredFormat: { textFormat: { italic: true } } }, fields: "userEnteredFormat.textFormat.italic" } });
    }
    await google(f, tk, `${api}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });

    const t2 = `'${nombre.replace(/'/g, "''")}'`;
    const vacias = Array.from({ length: ultima - PRIMERA + 1 - filas.length }, () => ["", "", "", ""]);
    const nota = (p.notaPie ?? "").trim() || ajustes.nota;
    await google(f, tk, `${api}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${t2}!A${pos.lugar}`, values: [[txt(lugarYFecha(p.lugar, p.fecha))]] },
          { range: `${t2}!A${pos.cliente}`, values: [[txt(d.cliente)]] },
          { range: `${t2}!A${pos.placa}`, values: [[txt([t.placa, t.bus].filter(Boolean).join(" / "))]] },
          { range: `${t2}!A${PRIMERA}:D${ultima}`, values: [...filas, ...vacias] },
          ...(nota ? [{ range: `${t2}!A${pos.nota + extra}`, values: [[txt(nota)]] }] : []),
          ...(ajustes.firma ? [{ range: `${t2}!A${pos.firma + extra}`, values: [[txt(ajustes.firma)]] }] : []),
        ],
      }),
    });

    const url = `https://docs.google.com/spreadsheets/d/${archivo}/edit#gid=${hoja}`;
    // Misma hora en las dos: "pendiente" = respaldado_en < actualizado_en.
    const ahora = new Date();
    await db.update(s.presupuestos).set({ sheetUrl: url, respaldadoEn: ahora, actualizadoEn: ahora, respaldoError: null }).where(eq(s.presupuestos.id, id));
    return url;
  } catch (e) {
    const mensaje = (e as Error).message.slice(0, 500);
    await db.update(s.presupuestos).set({ respaldoError: mensaje }).where(eq(s.presupuestos.id, id)).catch(() => {});
    throw e;
  }
}

/** Para los tests: olvidar el token y la plantilla guardados. */
export function olvidarCacheGoogle() {
  tokenCache = null;
  plantillaCache = null;
}

/** Presupuestos de la app que ya no son borrador y no tienen respaldo al día. */
export const condicionPendiente = and(
  eq(s.presupuestos.origen, "app"),
  ne(s.presupuestos.estado, "borrador"),
  or(isNull(s.presupuestos.respaldadoEn), lt(s.presupuestos.respaldadoEn, s.presupuestos.actualizadoEn)),
);

/** Respalda después de responder (no hace esperar a quien guarda). Sin Google configurado no hace nada. */
export function respaldarEnSegundoPlano(c: Context<AppEnv>, id: number) {
  if (!googleConfigurado(c.env)) return;
  const tarea = respaldarPresupuesto(c.var.db, c.env, id).catch((e) => console.error("respaldo", id, (e as Error).message));
  try {
    c.executionCtx.waitUntil(tarea);
  } catch {
    // Sin ExecutionContext (tests): la tarea sigue sola.
  }
}

export const contarPendientes = (db: Db) => db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(s.presupuestos).where(condicionPendiente);
