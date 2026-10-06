import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { Db } from "../db/tipos";
import type { AppEnv, Env } from "./env";
import { requiereUsuario } from "./middleware/auth";
import { rutasBuses } from "./routes/buses";
import { rutasClientes } from "./routes/clientes";
import { rutasConfiguracion } from "./routes/configuracion";
import { rutasEstadisticas } from "./routes/estadisticas";
import { rutasPresupuestos } from "./routes/presupuestos";
import { rutasProductos } from "./routes/productos";
import { rutasTrabajos } from "./routes/trabajos";
import { rutasUsuarios } from "./routes/usuarios";

/** Código de Postgres para "ya existe" (índice único). Drizzle a veces lo envuelve en `cause`. */
function esDuplicado(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** La API completa. Recibe cómo obtener la base para poder probarla con PGlite. */
export function crearApp(obtenerDb: (env: Env) => Db) {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use("*", async (c, next) => {
    c.set("db", obtenerDb(c.env));
    await next();
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

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof ZodError)
      return c.json({ error: err.issues.map((i) => i.message).join(" · ") || "Datos inválidos", detalles: err.issues }, 400);
    if (esDuplicado(err)) return c.json({ error: "Ya existe un registro con ese dato" }, 409);
    console.error(err);
    return c.json({ error: "Error interno" }, 500);
  });

  app.notFound((c) => c.json({ error: "No encontrado" }, 404));
  return app;
}
