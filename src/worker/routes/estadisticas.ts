import { Hono } from "hono";
import { obtenerEstadisticas } from "../../db/estadisticas";
import type { AppEnv } from "../env";

export const rutasEstadisticas = new Hono<AppEnv>().get("/", async (c) => {
  const datos = await obtenerEstadisticas(c.var.db, { desde: c.req.query("desde"), hasta: c.req.query("hasta") });
  return c.json(datos);
});
