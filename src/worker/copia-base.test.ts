import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { crearApp } from "./app";
import type { Env } from "./env";
import { contarFilas, exportarBase, FILAS_POR_PAGINA, paginaTabla, problemaCopia, restaurarBase, type CopiaBase } from "../db/copia-base";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";

async function baseNueva() {
  const db = drizzle(new PGlite(), { schema: s }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  return db;
}

const sinFecha = (c: CopiaBase) => ({ ...c, creada: "" });

/** Una base con un poco de todo (datos inventados), armada por la API como en la app. */
async function baseConDatos() {
  const db = await baseNueva();
  await db.insert(s.usuarios).values({ email: "admin@ejemplo.com", nombre: "Admin", rol: "admin", estado: "activo" });
  const app = crearApp(() => db);
  const env = { DEV_AUTH_EMAIL: "admin@ejemplo.com" } as unknown as Env;
  const pedir = async (m: string, r: string, b?: unknown) =>
    (await app.request(`/api${r}`, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }, env)).json() as Promise<any>;
  const cliente = await pedir("POST", "/clientes", { nombre: "Cliente Inventado" });
  const linea = (descripcion: string, precio: number, detalles: string[] = []) => ({ seccion: "ADENTRO", descripcion, cantidad: 2, precioUnitario: precio, precioPendiente: false, productoId: null, detalles });
  const p = await pedir("POST", "/presupuestos", {
    clienteId: cliente.id, titulo: "Prueba", fecha: "2026-03-02", lugar: "Pueblo", cerradoEn: 999.5, anticipo: 100, notas: "ñandú “comillas”", notaPie: null,
    lineas: [linea("Pintura", 450.25, ["Azul", "Blanco"]), linea("Sillas", 100)],
  });
  await pedir("POST", `/trabajos/${p.trabajoId}/pagos`, { fecha: "2026-03-05", monto: 250, forma: "cheque", nota: null });
  await pedir("PUT", "/configuracion", { empresa: "Taller de Prueba" });
  return { db, app, env, p };
}

describe("copia de la base", { timeout: 30_000 }, () => {
  it("exporta todo y lo restaura igual en otra base", async () => {
    const { db } = await baseConDatos();
    const copia = await exportarBase(db);
    expect(problemaCopia(copia)).toBeNull();
    expect(copia.migraciones).toBeGreaterThan(0);
    expect(copia.tablas.presupuesto_items).toHaveLength(4);
    expect(copia.tablas.pagos[0]).toMatchObject({ monto: 250, forma: "cheque" });

    // Pasa por texto, como el archivo descargado.
    const leida = JSON.parse(JSON.stringify(copia)) as CopiaBase;
    const otra = await baseNueva();
    await otra.insert(s.clientes).values({ nombre: "Esto se borra" });
    const r = await restaurarBase(otra, leida);
    expect(r.find((t) => t.nombre === "presupuesto_items")?.filas).toBe(4);
    expect(sinFecha(await exportarBase(otra))).toEqual(sinFecha(copia));

    // Las secuencias siguen después del último id.
    const [nuevo] = await otra.insert(s.clientes).values({ nombre: "Nuevo" }).returning();
    expect(nuevo.id).toBe(Math.max(...copia.tablas.clientes.map((c) => Number(c.id))) + 1);
  });

  it("restaura sub-items aunque el padre tenga un id mayor", async () => {
    const { db } = await baseConDatos();
    const copia = JSON.parse(JSON.stringify(await exportarBase(db))) as CopiaBase;
    const items = copia.tablas.presupuesto_items;
    const padre = items.find((i) => i.parent_id === null)!;
    const viejo = padre.id;
    padre.id = 500;
    for (const i of items) if (i.parent_id === viejo) i.parent_id = 500;
    const otra = await baseNueva();
    await restaurarBase(otra, copia);
    const hijos = (await exportarBase(otra)).tablas.presupuesto_items.filter((i) => i.parent_id === 500);
    expect(hijos).toHaveLength(2);
  });

  it("no restaura algo que no es una copia ni una copia de otra versión, y no toca la base", async () => {
    const otra = await baseNueva();
    await otra.insert(s.clientes).values({ nombre: "Se queda" });
    await expect(restaurarBase(otra, { app: "otra" } as never)).rejects.toThrow(/no es una copia/);
    const { db } = await baseConDatos();
    const copia = await exportarBase(db);
    await expect(restaurarBase(otra, { ...copia, migraciones: 1 })).rejects.toThrow(/migraciones/);
    expect((await contarFilas(otra)).find((t) => t.nombre === "clientes")?.filas).toBe(1);
  });

  it("pagina las tablas grandes", async () => {
    const db = await baseNueva();
    await db.insert(s.clientes).values(Array.from({ length: FILAS_POR_PAGINA + 5 }, (_, i) => ({ nombre: `Cliente ${i}` })));
    expect(await paginaTabla(db, "clientes", 0)).toHaveLength(FILAS_POR_PAGINA);
    expect(await paginaTabla(db, "clientes", 1)).toHaveLength(5);
  });

  it("API: solo el admin; resumen, páginas y fecha de la última copia", async () => {
    const { db, app, env } = await baseConDatos();
    await db.insert(s.usuarios).values({ email: "usuario@ejemplo.com", nombre: "Usuario", rol: "usuario", estado: "activo" });
    const como = (email: string) => ({ ...env, DEV_AUTH_EMAIL: email }) as unknown as Env;
    expect((await app.request("/api/copia-base", {}, como("usuario@ejemplo.com"))).status).toBe(403);

    const resumen = (await (await app.request("/api/copia-base", {}, env)).json()) as any;
    expect(resumen.ultima).toBeNull();
    expect(resumen.tablas.find((t: any) => t.nombre === "presupuesto_items").filas).toBe(4);
    const pagina = (await (await app.request("/api/copia-base/presupuestos?pagina=0", {}, env)).json()) as any;
    expect(pagina.filas).toHaveLength(1);
    expect((await app.request("/api/copia-base/otra_tabla", {}, env)).status).toBe(404);

    await app.request("/api/copia-base/hecha", { method: "POST" }, env);
    const { ultima } = (await (await app.request("/api/copia-base/ultima", {}, env)).json()) as any;
    expect(Date.now() - Date.parse(ultima)).toBeLessThan(60_000);
    // No se mezcla con el membrete.
    expect(Object.keys((await (await app.request("/api/configuracion", {}, env)).json()) as object)).not.toContain("ultima_copia_base");
  });
});
