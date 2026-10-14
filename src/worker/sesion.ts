/**
 * Sesión propia de la app: cookie "sesion" con un JWT HS256 firmado con SESSION_SECRET.
 * La reciben tanto quien entra con Google/código (Cloudflare Access en /acceso) como quien entra
 * con correo y contraseña (/api/sesion). Dura 30 días. Lleva la versión de la contraseña: si el
 * admin la cambia, las sesiones abiertas dejan de valer.
 */
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import type { AppEnv, Env } from "./env";

export const COOKIE_SESION = "sesion";
const DURACION = 60 * 60 * 24 * 30;

function secreto(env: Env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
    throw new Error("Falta SESSION_SECRET (mínimo 32 caracteres) en los secretos del Worker o en .dev.vars");
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function abrirSesion(c: Context<AppEnv>, u: { id: number; claveVersion: number }) {
  const token = await new SignJWT({ v: u.claveVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime(`${DURACION}s`)
    .sign(secreto(c.env));
  setCookie(c, COOKIE_SESION, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:" || new URL(c.req.url).hostname === "localhost",
    sameSite: "Lax",
    path: "/",
    maxAge: DURACION,
  });
}

export function cerrarSesion(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE_SESION, { path: "/" });
}

/** Lee la cookie de sesión. Devuelve el id del usuario y la versión de su contraseña, o null. */
export async function leerSesion(c: Context<AppEnv>): Promise<{ id: number; v: number } | null> {
  const token = getCookie(c, COOKIE_SESION);
  if (!token || !c.env.SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(c.env), { algorithms: ["HS256"] });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? { id, v: Number(payload.v ?? 0) } : null;
  } catch {
    return null;
  }
}
