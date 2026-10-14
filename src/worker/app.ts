import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { Db } from "../db/tipos";
import type { AppEnv, Env } from "./env";
import { emailDeAccess, requiereUsuario, usuarioDeAccess } from "./middleware/auth";
import { rutasBuses } from "./routes/buses";
import { rutasClientes } from "./routes/clientes";
import { rutasConfiguracion } from "./routes/configuracion";
import { rutasCopia } from "./routes/copia";
import { rutasEstadisticas } from "./routes/estadisticas";
import { rutasLector } from "./routes/lector";
import { rutasPresupuestos } from "./routes/presupuestos";
import { rutasProductos } from "./routes/productos";
import { rutasSesion } from "./routes/sesion";
import { rutasTrabajos } from "./routes/trabajos";
import { rutasUsuarios } from "./routes/usuarios";
import { abrirSesion } from "./sesion";

/** Código de Postgres para "ya existe" (índice único). Drizzle a veces lo envuelve en `cause`. */
function esDuplicado(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * La app del Worker: `/acceso` (entrada con Google o código, detrás de Cloudflare Access) y la API
 * en `/api/*`. Recibe cómo obtener la base para poder probarla con PGlite.
 */
export function crearApp(obtenerDb: (env: Env) => Db) {
  const raiz = new Hono<AppEnv>();
  const app = new Hono<AppEnv>().basePath("/api");

  raiz.use("*", async (c, next) => {
    c.set("db", obtenerDb(c.env));
    await next();
  });

  /**
   * Cloudflare Access protege SOLO esta ruta: quien llega aquí ya se identificó con Google o con
   * el código al correo. Se le abre la sesión de la app y se le manda al inicio. Quien tiene
   * contraseña no entra por aquí (su correo en Google podría ser de otra persona).
   */
  raiz.get("/acceso", async (c) => {
    if (c.env.DEV_AUTH_EMAIL) return c.redirect("/");
    const email = await emailDeAccess(c.req.raw, c.env);
    if (!email) return c.redirect("/entrar?error=acceso");
    const u = await usuarioDeAccess(c.var.db, email);
    if (!u) return c.redirect("/entrar?error=acceso");
    if (u.claveHash) return c.redirect("/entrar?error=con-clave");
    await abrirSesion(c, u);
    return c.redirect("/");
  });

  /** Público: lo usa el monitoreo para saber si la app y la base responden. */
  app.get("/health", async (c) => {
    try {
      await c.var.db.execute(sql`select 1`);
      return c.json({ ok: true, db: true });
    } catch {
      return c.json({ ok: true, db: false }, 503);
    }
  });

  app.route("/sesion", rutasSesion);
  app.use("*", requiereUsuario);

  app.get("/me", (c) => c.json(c.var.usuario));
  app.route("/usuarios", rutasUsuarios);
  app.route("/estadisticas", rutasEstadisticas);
  app.route("/clientes", rutasClientes);
  app.route("/buses", rutasBuses);
  app.route("/productos", rutasProductos);
  app.route("/presupuestos", rutasPresupuestos);
  app.route("/trabajos", rutasTrabajos);
  app.route("/configuracion", rutasConfiguracion);
  app.route("/copia-base", rutasCopia);
  app.route("/lector", rutasLector);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof ZodError)
      return c.json({ error: err.issues.map((i) => i.message).join(" · ") || "Datos inválidos", detalles: err.issues }, 400);
    if (esDuplicado(err)) return c.json({ error: "Ya existe un registro con ese dato" }, 409);
    console.error(err);
    return c.json({ error: "Error interno" }, 500);
  });

  app.notFound((c) => c.json({ error: "No encontrado" }, 404));
  raiz.route("/", app);
  raiz.notFound((c) => c.json({ error: "No encontrado" }, 404));
  return raiz;
}
