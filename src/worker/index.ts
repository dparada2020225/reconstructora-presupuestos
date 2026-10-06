import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { crearDb } from "./db";
import type { AppEnv } from "./env";
import { requiereUsuario } from "./middleware/auth";
import { rutasEstadisticas } from "./routes/estadisticas";
import { rutasUsuarios } from "./routes/usuarios";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  c.set("db", crearDb(c.env.DATABASE_URL));
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

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof ZodError) return c.json({ error: "Datos inválidos", detalles: err.issues }, 400);
  console.error(err);
  return c.json({ error: "Error interno" }, 500);
});

app.notFound((c) => c.json({ error: "No encontrado" }, 404));

export default app;
