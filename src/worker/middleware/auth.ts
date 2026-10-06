import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { usuarios } from "../../db/schema";
import type { AppEnv, Env, Usuario } from "../env";

const jwksPorDominio = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Producción: la app vive detrás de Cloudflare Access, que solo deja pasar a los
 * correos permitidos y agrega un JWT firmado. Aquí lo verificamos (defensa en
 * profundidad) y sacamos el email.
 * Local: si existe DEV_AUTH_EMAIL (.dev.vars) se usa ese correo.
 */
async function emailDeLaPeticion(req: Request, env: Env): Promise<string | null> {
  if (env.DEV_AUTH_EMAIL) return env.DEV_AUTH_EMAIL;

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
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Exige un usuario activo registrado en la tabla `usuarios`. */
export const requiereUsuario = createMiddleware<AppEnv>(async (c, next) => {
  const email = await emailDeLaPeticion(c.req.raw, c.env);
  if (!email) throw new HTTPException(401, { message: "No autenticado" });

  const [u] = await c.var.db
    .select({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo })
    .from(usuarios)
    .where(eq(usuarios.email, email.toLowerCase()))
    .limit(1);
  if (!u || !u.activo) throw new HTTPException(403, { message: "Usuario sin acceso" });

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
