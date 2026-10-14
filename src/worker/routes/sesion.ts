import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { usuarios } from "../../db/schema";
import { hashClave, normalizarUsuario, verificarClave } from "../../shared/clave";
import type { AppEnv } from "../env";
import { usuarioPorEmail } from "../middleware/auth";
import { abrirSesion, cerrarSesion } from "../sesion";

/** Intentos fallidos seguidos antes de bloquear, y por cuánto tiempo. */
export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;

const entrada = z.object({
  email: z.string().trim().min(1, "Escribe tu correo").max(120),
  clave: z.string().min(1, "Escribe tu contraseña").max(200),
});

/** Para no delatar si un correo existe: se calcula un hash igual aunque no exista. */
let hashFalso: Promise<string> | null = null;

/**
 * Entrar con correo y contraseña (pública: va ANTES de exigir usuario).
 * Después de 5 intentos fallidos seguidos, ese usuario queda bloqueado 15 minutos.
 */
export const rutasSesion = new Hono<AppEnv>()
  .post("/", async (c) => {
    const { email, clave } = entrada.parse(await c.req.json());
    const db = c.var.db;
    const u = await usuarioPorEmail(db, normalizarUsuario(email));
    const incorrecto = new HTTPException(401, { message: "Correo o contraseña incorrectos" });

    if (!u?.claveHash) {
      await verificarClave(clave, await (hashFalso ??= hashClave("no-existe")));
      throw incorrecto;
    }
    const [extra] = await db
      .select({ bloqueadoHasta: usuarios.bloqueadoHasta })
      .from(usuarios)
      .where(eq(usuarios.id, u.id));
    if (extra?.bloqueadoHasta && extra.bloqueadoHasta.getTime() > Date.now()) {
      const min = Math.ceil((extra.bloqueadoHasta.getTime() - Date.now()) / 60_000);
      throw new HTTPException(429, { message: `Demasiados intentos. Espera ${min} ${min === 1 ? "minuto" : "minutos"} o pide al administrador que te cambie la contraseña.` });
    }

    if (!(await verificarClave(clave, u.claveHash))) {
      await db
        .update(usuarios)
        .set({
          intentosFallidos: sql`case when ${usuarios.intentosFallidos} + 1 >= ${MAX_INTENTOS} then 0 else ${usuarios.intentosFallidos} + 1 end`,
          bloqueadoHasta: sql`case when ${usuarios.intentosFallidos} + 1 >= ${MAX_INTENTOS} then now() + make_interval(mins => ${MINUTOS_BLOQUEO}) else ${usuarios.bloqueadoHasta} end`,
        })
        .where(eq(usuarios.id, u.id));
      throw incorrecto;
    }

    await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(usuarios.id, u.id));
    if (u.estado !== "activo") throw new HTTPException(403, { message: u.estado });
    await abrirSesion(c, u);
    return c.json({ ok: true });
  })
  .delete("/", (c) => {
    cerrarSesion(c);
    return c.json({ ok: true });
  });
