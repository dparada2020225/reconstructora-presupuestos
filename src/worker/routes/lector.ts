import { inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import * as s from "../../db/schema";
import type { Db } from "../../db/tipos";
import {
  esProveedor,
  LISTA_MODOS,
  leerModos,
  type ModosNuevo,
  extraerJson,
  instrucciones,
  LIMITE_DIARIO,
  LISTA_PROVEEDORES,
  MAX_FOTOS,
  normalizarLectura,
  PROVEEDOR_POR_DEFECTO,
  PROVEEDORES_LECTOR,
  type ProveedorLector,
  type RespuestaLector,
} from "../../shared/lector";
import { hoyGuatemala } from "../../shared/presupuesto";
import type { AppEnv, Env } from "../env";
import { ErrorLector, leerFotos, proveedorDisponible, type Foto } from "../lector";
import { requiereRol } from "../middleware/auth";

const CLAVE_PROVEEDOR = "lector_proveedor";
const CLAVE_USO = "lector_uso";
const CLAVE_MODOS = "nuevo_modos";

const RE_FOTO = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const pedido = z.object({
  fotos: z
    .array(z.string().max(4_000_000, "Una foto es muy pesada").regex(RE_FOTO, "Las fotos deben ser JPG, PNG o WebP"))
    .min(1, "Sube al menos una foto")
    .max(MAX_FOTOS, `Máximo ${MAX_FOTOS} fotos por presupuesto`),
  /** Nombres del catálogo para ayudarle a la IA a entender la letra. */
  vocabulario: z.array(z.string().max(80)).max(300).optional(),
  /** Para probar otro lector sin cambiar el de Ajustes. */
  proveedor: z.string().optional(),
});

async function leerClaves(db: Db) {
  const filas = await db.select().from(s.configuracion).where(inArray(s.configuracion.clave, [CLAVE_PROVEEDOR, CLAVE_USO, CLAVE_MODOS]));
  const valor = (k: string) => filas.find((f) => f.clave === k)?.valor;
  const guardado = valor(CLAVE_PROVEEDOR);
  let uso = { fecha: "", n: 0 };
  try {
    uso = { ...uso, ...JSON.parse(valor(CLAVE_USO) ?? "{}") };
  } catch {
    /* valor viejo o roto: se empieza de cero */
  }
  const hoy = hoyGuatemala();
  return {
    proveedor: esProveedor(guardado) ? guardado : PROVEEDOR_POR_DEFECTO,
    usoHoy: uso.fecha === hoy ? Number(uso.n) || 0 : 0,
    hoy,
    modos: leerModos(valor(CLAVE_MODOS)),
  };
}

const guardar = (db: Db, clave: string, valor: string) =>
  db
    .insert(s.configuracion)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: s.configuracion.clave, set: { valor: sql`excluded.valor`, actualizadoEn: sql`now()` } });

function estado(env: Env, proveedor: ProveedorLector, usoHoy: number, modos: ModosNuevo) {
  return {
    proveedor,
    /** Qué opciones salen en "Nuevo presupuesto". */
    modos,
    proveedores: LISTA_PROVEEDORES.map((id) => ({ id, ...PROVEEDORES_LECTOR[id], disponible: proveedorDisponible(env, id) })),
    usoHoy,
    limite: LIMITE_DIARIO,
  };
}

/** Presupuesto desde fotos (ver src/worker/lector.ts y src/shared/lector.ts). */
export const rutasLector = new Hono<AppEnv>()
  .get("/", async (c) => {
    const { proveedor, usoHoy, modos } = await leerClaves(c.var.db);
    return c.json(estado(c.env, proveedor, usoHoy, modos));
  })

  /** Cambia el lector que se usa y/o qué opciones salen en "Nuevo presupuesto" (admin). */
  .put("/", requiereRol("admin"), async (c) => {
    const datos = z
      .object({
        proveedor: z.string().optional(),
        modos: z.object({ mano: z.boolean(), fotos: z.boolean(), pegar: z.boolean() }).partial().optional(),
      })
      .parse(await c.req.json());
    if (datos.proveedor !== undefined) {
      if (!esProveedor(datos.proveedor)) return c.json({ error: "Ese lector no existe" }, 400);
      await guardar(c.var.db, CLAVE_PROVEEDOR, datos.proveedor);
    }
    if (datos.modos) {
      const actual = (await leerClaves(c.var.db)).modos;
      const nuevos = { ...actual, ...datos.modos };
      if (!LISTA_MODOS.some((k) => nuevos[k])) return c.json({ error: "Deja al menos una forma de hacer presupuestos" }, 400);
      await guardar(c.var.db, CLAVE_MODOS, JSON.stringify(nuevos));
    }
    const { proveedor, usoHoy, modos } = await leerClaves(c.var.db);
    return c.json(estado(c.env, proveedor, usoHoy, modos));
  })

  /** Lee las fotos y devuelve el presupuesto que encontró (no guarda nada: eso lo hace el editor). */
  .post("/", async (c) => {
    const datos = pedido.parse(await c.req.json());
    const claves = await leerClaves(c.var.db);
    if (!claves.modos.fotos) return c.json({ error: "La opción Desde fotos está apagada (Ajustes)" }, 403);
    const proveedor = datos.proveedor === undefined ? claves.proveedor : datos.proveedor;
    if (!esProveedor(proveedor)) return c.json({ error: "Ese lector no existe" }, 400);
    if (!proveedorDisponible(c.env, proveedor))
      return c.json({ error: `${PROVEEDORES_LECTOR[proveedor].nombre} no está configurado todavía. El admin puede escoger otro lector en Ajustes.` }, 503);
    if (claves.usoHoy >= LIMITE_DIARIO) return c.json({ error: `Ya se leyeron ${LIMITE_DIARIO} presupuestos hoy (es el límite diario). Mañana se puede de nuevo.` }, 429);
    // Se cuenta antes de leer: un error también gastó la lectura.
    const usoHoy = claves.usoHoy + 1;
    await guardar(c.var.db, CLAVE_USO, JSON.stringify({ fecha: claves.hoy, n: usoHoy }));

    const fotos: Foto[] = datos.fotos.map((f) => {
      const [, tipo, b64] = f.match(RE_FOTO)!;
      return { tipo, datos: b64 };
    });
    const vocabulario = [...new Set((datos.vocabulario ?? []).map((v) => v.trim()).filter(Boolean))];
    try {
      const texto = await leerFotos(c.env, proveedor, fotos, instrucciones(vocabulario));
      const lectura = normalizarLectura(extraerJson(texto));
      return c.json({ lectura, proveedor, usoHoy, limite: LIMITE_DIARIO } satisfies RespuestaLector);
    } catch (e) {
      if (e instanceof ErrorLector) return c.json({ error: e.message }, e.status);
      if (e instanceof Error && /JSON|presupuesto/.test(e.message))
        return c.json({ error: `${e.message}. Intenta otra vez${proveedor === "claude" ? "" : " o con otro lector"}.` }, 502);
      throw e;
    }
  });
