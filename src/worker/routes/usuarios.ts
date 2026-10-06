import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { usuarios } from "../../db/schema";
import type { AppEnv } from "../env";
import { requiereRol } from "../middleware/auth";

const cambio = z.object({
  estado: z.enum(["pendiente", "activo", "denegado"]).optional(),
  rol: z.enum(["admin", "usuario"]).optional(),
  nombre: z.string().trim().min(1).max(80).optional(),
});

/** Solo admin: ver quién pidió acceso y autorizarlo o negarlo. */
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
      })
      .from(usuarios)
      .orderBy(sql`case ${usuarios.estado} when 'pendiente' then 0 when 'activo' then 1 else 2 end`, asc(usuarios.email));
    return c.json(filas);
  })
  .patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) throw new HTTPException(400, { message: "id inválido" });
    const datos = cambio.parse(await c.req.json());
    if (id === c.var.usuario.id && (datos.estado && datos.estado !== "activo" || datos.rol === "usuario"))
      throw new HTTPException(400, { message: "No puedes quitarte el acceso o el rol de admin a ti mismo" });
    const [u] = await c.var.db.update(usuarios).set(datos).where(eq(usuarios.id, id)).returning({ id: usuarios.id });
    if (!u) throw new HTTPException(404, { message: "Usuario no encontrado" });
    return c.json({ ok: true });
  });
