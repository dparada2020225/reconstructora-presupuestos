import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { usuarios } from "../../db/schema";
import { CLAVE_MAX, CLAVE_MIN, hashClave, normalizarUsuario } from "../../shared/clave";
import type { AppEnv } from "../env";
import { requiereRol } from "../middleware/auth";

const cambio = z.object({
  estado: z.enum(["pendiente", "activo", "denegado"]).optional(),
  rol: z.enum(["admin", "usuario"]).optional(),
  nombre: z.string().trim().min(1).max(80).optional(),
});

const clave = z
  .string()
  .min(CLAVE_MIN, `La contraseña debe tener al menos ${CLAVE_MIN} caracteres`)
  .max(CLAVE_MAX, `Máximo ${CLAVE_MAX} caracteres`);

const nuevo = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Escribe el correo o usuario")
    .max(120)
    .refine((v) => !/\s/.test(v), "Sin espacios")
    .transform(normalizarUsuario),
  nombre: z.string().trim().min(1, "Escribe el nombre").max(80),
  clave,
  rol: z.enum(["admin", "usuario"]).default("usuario"),
});

const idDe = (v: string) => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new HTTPException(400, { message: "id inválido" });
  return id;
};

/**
 * Solo admin: autorizar o negar el acceso a quien entró a la app, y manejar los usuarios que
 * entran con correo y contraseña (crearlos ya autorizados, cambiarles o quitarles la contraseña).
 * Las contraseñas no se pueden ver: solo se guarda su hash.
 */
export const rutasUsuarios = new Hono<AppEnv>()
  .use("*", requiereRol("admin"))
  .get("/", async (c) => {
    const filas = await c.var.db
      .select({
        id: usuarios.id,
        email: usuarios.email,
        nombre: usuarios.nombre,
        rol: usuarios.rol,
        estado: usuarios.estado,
        creadoEn: usuarios.creadoEn,
        conClave: sql<boolean>`${usuarios.claveHash} is not null`,
        bloqueadoHasta: sql<string | null>`case when ${usuarios.bloqueadoHasta} > now() then ${usuarios.bloqueadoHasta} end`,
      })
      .from(usuarios)
      .orderBy(sql`case ${usuarios.estado} when 'pendiente' then 0 when 'activo' then 1 else 2 end`, asc(usuarios.email));
    return c.json(filas.map((f) => ({ ...f, conClave: !!f.conClave })));
  })

  /** Usuario nuevo que entra con correo y contraseña, ya autorizado. */
  .post("/", async (c) => {
    const d = nuevo.parse(await c.req.json());
    const [ya] = await c.var.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, d.email));
    if (ya) throw new HTTPException(409, { message: "Ya existe un usuario con ese correo. Usa “Poner contraseña” en su fila." });
    const [u] = await c.var.db
      .insert(usuarios)
      .values({ email: d.email, nombre: d.nombre, rol: d.rol, estado: "activo", claveHash: await hashClave(d.clave) })
      .returning({ id: usuarios.id });
    return c.json({ id: u.id }, 201);
  })

  .patch("/:id", async (c) => {
    const id = idDe(c.req.param("id"));
    const datos = cambio.parse(await c.req.json());
    if (id === c.var.usuario.id && (datos.estado && datos.estado !== "activo" || datos.rol === "usuario"))
      throw new HTTPException(400, { message: "No puedes quitarte el acceso o el rol de admin a ti mismo" });
    const [u] = await c.var.db.update(usuarios).set(datos).where(eq(usuarios.id, id)).returning({ id: usuarios.id });
    if (!u) throw new HTTPException(404, { message: "Usuario no encontrado" });
    return c.json({ ok: true });
  })

  /** Poner o cambiar la contraseña (también desbloquea). Cierra sus sesiones abiertas. */
  .put("/:id/clave", async (c) => {
    const id = idDe(c.req.param("id"));
    const d = z.object({ clave }).parse(await c.req.json());
    const [u] = await c.var.db
      .update(usuarios)
      .set({ claveHash: await hashClave(d.clave), claveVersion: sql`${usuarios.claveVersion} + 1`, intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id))
      .returning({ id: usuarios.id });
    if (!u) throw new HTTPException(404, { message: "Usuario no encontrado" });
    return c.json({ ok: true });
  })

  /** Quitar la contraseña: vuelve a entrar solo con Google o código al correo. */
  .delete("/:id/clave", async (c) => {
    const id = idDe(c.req.param("id"));
    const [u] = await c.var.db
      .update(usuarios)
      .set({ claveHash: null, claveVersion: sql`${usuarios.claveVersion} + 1`, intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id))
      .returning({ id: usuarios.id });
    if (!u) throw new HTTPException(404, { message: "Usuario no encontrado" });
    return c.json({ ok: true });
  });
