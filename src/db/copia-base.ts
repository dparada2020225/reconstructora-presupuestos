/**
 * Copia completa de la base (todas las tablas) a un JSON, y su restauración.
 *
 * - En la app (Ajustes, admin): el navegador pide cada tabla de a páginas y arma el archivo
 *   (el Worker gratis tiene ~10 ms de CPU por petición, así que cada petición es chica).
 * - En la terminal: `npm run db:copia` / `db:copia:produccion` y `npm run db:restaurar`.
 *
 * Las filas salen con `row_to_json` (formato de Postgres, igual con cualquier driver) y vuelven
 * con `json_populate_recordset`, así no hay que mapear columnas ni tipos a mano.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "./tipos";

/** Tablas en orden de dependencias (las referenciadas primero). `orden` = llave primaria. */
export const TABLAS_COPIA = [
  { nombre: "usuarios", orden: "id", serial: true },
  { nombre: "clientes", orden: "id", serial: true },
  { nombre: "cliente_alias", orden: "id", serial: true },
  { nombre: "buses", orden: "id", serial: true },
  { nombre: "productos", orden: "id", serial: true },
  { nombre: "producto_alias", orden: "id", serial: true },
  { nombre: "duplicados_descartados", orden: "tipo, a_id, b_id", serial: false },
  { nombre: "configuracion", orden: "clave", serial: false },
  { nombre: "trabajos", orden: "id", serial: true },
  { nombre: "presupuestos", orden: "id", serial: true },
  { nombre: "pagos", orden: "id", serial: true },
  // parent_id apunta a la misma tabla: se inserta sin él y se completa después (el padre puede tener id mayor).
  { nombre: "presupuesto_items", orden: "id", serial: true, autoref: "parent_id" },
] as const;

export type NombreTabla = (typeof TABLAS_COPIA)[number]["nombre"];
export const FILAS_POR_PAGINA = 1000;
export const APP_COPIA = "reconstructora-presupuestos";
/** Clave en `configuracion` con la fecha de la última copia descargada desde la app. */
export const CLAVE_ULTIMA_COPIA = "ultima_copia_base";

export interface CopiaBase {
  app: typeof APP_COPIA;
  version: 1;
  creada: string;
  /** Cuántas migraciones tenía la base: solo se restaura en una base con las mismas. */
  migraciones: number | null;
  tablas: Record<NombreTabla, Record<string, unknown>[]>;
}

export const esTablaCopia = (t: string): t is NombreTabla => TABLAS_COPIA.some((x) => x.nombre === t);

/** Filas de un `execute` (postgres-js devuelve un arreglo; neon-http y PGlite, `{ rows }`). */
async function filas<T>(db: Db, q: SQL): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as T[] | { rows: T[] };
  return Array.isArray(r) ? r : r.rows;
}

const tabla = (nombre: NombreTabla) => TABLAS_COPIA.find((t) => t.nombre === nombre)!;

export async function contarFilas(db: Db): Promise<{ nombre: NombreTabla; filas: number }[]> {
  const union = sql.raw(TABLAS_COPIA.map((t) => `select '${t.nombre}' as nombre, count(*)::int as filas from "${t.nombre}"`).join(" union all "));
  const r = await filas<{ nombre: NombreTabla; filas: number }>(db, union);
  return TABLAS_COPIA.map((t) => ({ nombre: t.nombre, filas: Number(r.find((x) => x.nombre === t.nombre)?.filas ?? 0) }));
}

/** Una página de una tabla (filas como objetos JSON con los nombres de columna de la base). */
export async function paginaTabla(db: Db, nombre: NombreTabla, pagina: number): Promise<Record<string, unknown>[]> {
  const t = tabla(nombre);
  const desde = Math.max(0, Math.floor(pagina)) * FILAS_POR_PAGINA;
  const r = await filas<{ f: Record<string, unknown> | string }>(
    db,
    sql.raw(`select row_to_json(t) as f from "${t.nombre}" t order by ${t.orden} limit ${FILAS_POR_PAGINA} offset ${desde}`),
  );
  return r.map((x) => (typeof x.f === "string" ? JSON.parse(x.f) : x.f));
}

export async function migracionesAplicadas(db: Db): Promise<number | null> {
  try {
    const [r] = await filas<{ n: number }>(db, sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    return Number(r.n);
  } catch {
    return null;
  }
}

/** Toda la base en memoria (para los scripts y las pruebas; en la app lo arma el navegador). */
export async function exportarBase(db: Db): Promise<CopiaBase> {
  const tablas = {} as CopiaBase["tablas"];
  for (const { nombre, filas: n } of await contarFilas(db)) {
    tablas[nombre] = [];
    for (let p = 0; p * FILAS_POR_PAGINA < n; p++) tablas[nombre].push(...(await paginaTabla(db, nombre, p)));
  }
  return { app: APP_COPIA, version: 1, creada: new Date().toISOString(), migraciones: await migracionesAplicadas(db), tablas };
}

/** Revisa que un JSON sea una copia de esta app. Devuelve el problema o null. */
export function problemaCopia(c: unknown): string | null {
  const x = c as Partial<CopiaBase> | null;
  if (!x || x.app !== APP_COPIA || x.version !== 1 || typeof x.tablas !== "object" || !x.tablas) return "Ese archivo no es una copia de la base de esta app.";
  for (const t of TABLAS_COPIA) if (!Array.isArray((x.tablas as Record<string, unknown>)[t.nombre])) return `A la copia le falta la tabla ${t.nombre}.`;
  return null;
}

/**
 * Reemplaza TODO el contenido de la base por el de la copia, en una transacción (si algo falla,
 * la base queda como estaba). La base destino debe tener las mismas migraciones que la copia.
 * Solo para drivers con transacciones (postgres-js en scripts, PGlite en pruebas).
 */
export async function restaurarBase(db: Db, copia: CopiaBase): Promise<{ nombre: NombreTabla; filas: number }[]> {
  const problema = problemaCopia(copia);
  if (problema) throw new Error(problema);
  const destino = await migracionesAplicadas(db);
  if (copia.migraciones !== null && destino !== copia.migraciones)
    throw new Error(`La copia es de una base con ${copia.migraciones} migraciones y esta tiene ${destino ?? "?"}. Corre las migraciones (npm run db:migrate) para que coincidan.`);

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`truncate table ${TABLAS_COPIA.map((t) => `"${t.nombre}"`).join(", ")} restart identity cascade`));
    for (const t of TABLAS_COPIA) {
      const xs = copia.tablas[t.nombre];
      const autoref = "autoref" in t ? t.autoref : null;
      const nombre = sql.raw(`"${t.nombre}"`);
      for (let i = 0; i < xs.length; i += FILAS_POR_PAGINA) {
        const parte = xs.slice(i, i + FILAS_POR_PAGINA);
        const lote = JSON.stringify(autoref ? parte.map((f) => ({ ...f, [autoref]: null })) : parte);
        await tx.execute(sql`insert into ${nombre} select * from json_populate_recordset(null::${nombre}, ${lote}::json)`);
      }
      if (autoref) {
        const col = sql.raw(`"${autoref}"`);
        const pares = xs.filter((f) => f[autoref] !== null && f[autoref] !== undefined).map((f) => ({ id: f.id, ref: f[autoref] }));
        for (let i = 0; i < pares.length; i += FILAS_POR_PAGINA) {
          const lote = JSON.stringify(pares.slice(i, i + FILAS_POR_PAGINA));
          await tx.execute(sql`update ${nombre} t set ${col} = (x->>'ref')::int from json_array_elements(${lote}::json) x where t.id = (x->>'id')::int`);
        }
      }
      if (t.serial)
        await tx.execute(sql.raw(`select setval(pg_get_serial_sequence('"${t.nombre}"', 'id'), coalesce(max(id), 1), max(id) is not null) from "${t.nombre}"`));
    }
  });
  return TABLAS_COPIA.map((t) => ({ nombre: t.nombre, filas: copia.tablas[t.nombre].length }));
}
