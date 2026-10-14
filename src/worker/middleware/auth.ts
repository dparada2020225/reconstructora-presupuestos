import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { usuarios } from "../../db/schema";
import type { Db } from "../../db/tipos";
import type { AppEnv, Env, Usuario } from "../env";
import { leerSesion } from "../sesion";

const jwksPorDominio = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Correo que viene de Cloudflare Access (Google o código al correo), verificando su JWT
 * (`Cf-Access-Jwt-Assertion`). Null si no viene o no es válido.
 */
export async function emailDeAccess(req: Request, env: Env): Promise<string | null> {
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

  let jwks = jwksPorDominio.get(env.ACCESS_TEAM_DOMAIN);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    jwksPorDominio.set(env.ACCESS_TEAM_DOMAIN, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

const columnas = {
  id: usuarios.id,
  email: usuarios.email,
  nombre: usuarios.nombre,
  rol: usuarios.rol,
  estado: usuarios.estado,
  claveHash: usuarios.claveHash,
  claveVersion: usuarios.claveVersion,
};

type UsuarioCompleto = { id: number; email: string; nombre: string; rol: Usuario["rol"]; estado: "pendiente" | "activo" | "denegado"; claveHash: string | null; claveVersion: number };

export async function usuarioPorEmail(db: Db, email: string): Promise<UsuarioCompleto | null> {
  const [u] = await db.select(columnas).from(usuarios).where(eq(usuarios.email, email)).limit(1);
  return u ?? null;
}

/**
 * Usuario de Access (Google/código): si no existe, lo registra como "pendiente".
 * Quien tiene contraseña NO puede entrar por aquí (su correo podría ser de otra persona en Google).
 */
export async function usuarioDeAccess(db: Db, email: string) {
  const u = await usuarioPorEmail(db, email);
  if (u) return u;
  await db.insert(usuarios).values({ email, nombre: email.split("@")[0], estado: "pendiente" }).onConflictDoNothing();
  return usuarioPorEmail(db, email);
}

/**
 * Exige un usuario ACTIVO. Se identifica, en este orden:
 *   1. DEV_AUTH_EMAIL (solo en local, .dev.vars).
 *   2. Cookie de sesión de la app (entró con contraseña o pasó por /acceso).
 *   3. JWT de Cloudflare Access (cuando Access protege toda la app).
 * Quien entra por primera vez con Access queda "pendiente" hasta que el admin lo autoriza.
 */
export const requiereUsuario = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.var.db;
  let u: UsuarioCompleto | null = null;

  if (c.env.DEV_AUTH_EMAIL) {
    u = await usuarioDeAccess(db, c.env.DEV_AUTH_EMAIL.toLowerCase());
  } else {
    const sesion = await leerSesion(c);
    if (sesion) {
      const [x] = await db.select(columnas).from(usuarios).where(eq(usuarios.id, sesion.id)).limit(1);
      // Si le cambiaron la contraseña después de abrir la sesión, la sesión ya no vale.
      if (x && x.claveVersion === sesion.v) u = x;
    }
    if (!u) {
      const email = await emailDeAccess(c.req.raw, c.env);
      if (email) {
        u = await usuarioDeAccess(db, email);
        if (u?.claveHash) throw new HTTPException(403, { message: "con-clave" });
      }
    }
  }

  if (!u) throw new HTTPException(401, { message: "No autenticado" });
  if (u.estado !== "activo") throw new HTTPException(403, { message: u.estado });

  const usuario: Usuario = { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol };
  c.set("usuario", usuario);
  await next();
});

/** Restringe una ruta a ciertos roles. */
export const requiereRol = (...roles: Usuario["rol"][]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.var.usuario.rol)) throw new HTTPException(403, { message: "Sin permiso" });
    await next();
  });
