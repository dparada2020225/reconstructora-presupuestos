import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";
import type { LineaEntrada, PresupuestoEntrada } from "../shared/presupuesto";
import { crearApp } from "./app";
import type { Env } from "./env";

/** Datos inventados: el repo es público. */
let db: Db;
const app = crearApp(() => db);

async function pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown, correo = "admin@ejemplo.com") {
  const res = await app.request(
    `/api${ruta}`,
    { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) },
    { DEV_AUTH_EMAIL: correo } as unknown as Env,
  );
  return { status: res.status, json: (await res.json()) as T };
}

const linea = (descripcion: string, precioUnitario: number | null, extra: Partial<LineaEntrada> = {}): LineaEntrada => ({
  seccion: "ADENTRO",
  descripcion,
  cantidad: 1,
  precioUnitario,
  precioPendiente: false,
  productoId: null,
  detalles: [],
  ...extra,
});

const base = (lineas: LineaEntrada[], extra: Partial<PresupuestoEntrada> = {}): PresupuestoEntrada => ({
  titulo: null,
  fecha: "2026-03-02",
  lugar: "Pueblo de Prueba",
  cerradoEn: null,
  anticipo: null,
  notas: null,
  notaPie: null,
  lineas,
  ...extra,
});

let clienteId: number;
let busId: number;
let productoId: number;

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema: s }) as unknown as Db;
  await migrate(db as any, { migrationsFolder: "./drizzle" });
  await db.insert(s.usuarios).values([
    { email: "admin@ejemplo.com", nombre: "Admin", rol: "admin", estado: "activo" },
    { email: "editora@ejemplo.com", nombre: "Editora", rol: "usuario", estado: "activo" },
  ]);
  clienteId = (await pedir("POST", "/clientes", { nombre: "Cliente Inventado" })).json.id;
  busId = (await pedir("POST", "/buses", { clienteId, nombre: "La Prueba" })).json.id;
  productoId = (await pedir("POST", "/productos", { nombre: "Pintura afuera", precioReferencia: 9000 })).json.id;
});

describe("presupuestos", () => {
  let id: number;
  let trabajoId: number;

  it("crea un trabajo nuevo con su presupuesto original", async () => {
    const r = await pedir("POST", "/presupuestos", base(
      [
        linea("Pintura por fuera", 9000, { seccion: "AFUERA" }),
        linea("Sillas nuevas", 450, { cantidad: 4, detalles: ["Tapizado azul", "Con cinturón"] }),
        linea("Luces de techo", null, { precioPendiente: true }),
      ],
      { clienteId, busId },
    ), "editora@ejemplo.com");
    expect(r.status).toBe(201);
    ({ id, trabajoId } = r.json);

    const { json } = await pedir("GET", `/presupuestos/${id}`);
    expect(json).toMatchObject({ tipo: "original", numero: 0, estado: "borrador", total: 10800, fecha: "2026-03-02" });
    expect(json.trabajo).toMatchObject({ id: trabajoId, clienteId, busId, estado: "cotizado", cliente: "Cliente Inventado", bus: "La Prueba" });
    const padres = json.items.filter((i: any) => i.parentId === null);
    expect(padres.map((i: any) => [i.descripcion, i.precio])).toEqual([["Pintura por fuera", 9000], ["Sillas nuevas", 1800], ["Luces de techo", null]]);
    // Se enlazó solo al catálogo por el alias ("por fuera" = "afuera").
    expect(padres[0].productoId).toBe(productoId);
    const hijos = json.items.filter((i: any) => i.parentId === padres[1].id);
    expect(hijos.map((i: any) => i.descripcion)).toEqual(["Tapizado azul", "Con cinturón"]);
  });

  it("guardar reemplaza las líneas y recalcula el total", async () => {
    const r = await pedir("PUT", `/presupuestos/${id}`, base([linea("Pintura afuera", 8500, { productoId })], { cerradoEn: 8000, fecha: "2026-03-05" }));
    expect(r.status).toBe(200);
    const { json } = await pedir("GET", `/presupuestos/${id}`);
    expect(json).toMatchObject({ total: 8500, cerradoEn: 8000, fecha: "2026-03-05" });
    expect(json.items).toHaveLength(1);
    // El producto ya cuenta con el último precio.
    const prod = await pedir("GET", `/productos/${productoId}`);
    expect(prod.json.usos[0]).toMatchObject({ unitario: 8500, cliente: "Cliente Inventado" });
  });

  it("valida las líneas", async () => {
    const r = await pedir("PUT", `/presupuestos/${id}`, base([linea("  ", 10)]));
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/sin descripción/);
  });

  it("los extras van numerados dentro del mismo trabajo", async () => {
    const e1 = await pedir("POST", "/presupuestos", base([linea("Bocinas", 1200)], { trabajoId }));
    const e2 = await pedir("POST", "/presupuestos", base([linea("Escaleras", 900)], { trabajoId }));
    expect((await pedir("GET", `/presupuestos/${e1.json.id}`)).json).toMatchObject({ tipo: "extra", numero: 1 });
    const d2 = await pedir("GET", `/presupuestos/${e2.json.id}`);
    expect(d2.json).toMatchObject({ tipo: "extra", numero: 2 });
    expect(d2.json.hermanos.map((h: any) => [h.numero, h.total])).toEqual([[0, 8500], [1, 1200], [2, 900]]);

    const t = await pedir("GET", `/trabajos/${trabajoId}`);
    // Cerrado en 8000 reemplaza al original; los extras se suman encima.
    expect(t.json).toMatchObject({ monto: 10100, cotizado: 10600, estado: "cotizado" });
  });

  it("estados de los presupuestos y del trabajo", async () => {
    const t = async () => (await pedir("GET", `/trabajos/${trabajoId}`)).json;
    // Original + 2 extras, todos borrador → trabajo cotizado.
    expect((await t()).estado).toBe("cotizado");
    expect((await pedir("PATCH", `/presupuestos/${id}/estado`, { estado: "listo" })).status).toBe(400);
    await pedir("PATCH", `/presupuestos/${id}/estado`, { estado: "en_curso" });
    expect((await t()).estado).toBe("en_curso");
    expect((await pedir("DELETE", `/presupuestos/${id}`)).status).toBe(409);

    const hermanos = (await pedir("GET", `/presupuestos/${id}`)).json.hermanos.map((h: any) => h.id);
    await pedir("PATCH", `/presupuestos/${hermanos[1]}/estado`, { estado: "cancelado" });
    await pedir("PATCH", `/presupuestos/${id}/estado`, { estado: "terminado" });
    // Queda Extra 2 en borrador: no cuenta → todo lo vigente está terminado.
    const t1 = await t();
    expect(t1.estado).toBe("terminado");
    expect(t1.fechaFin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // El extra cancelado ya no suma: 8000 (cerrado) + 900 del borrador.
    expect(t1.monto).toBe(8900);

    await pedir("PATCH", `/presupuestos/${hermanos[2]}/estado`, { estado: "cotizacion" });
    expect((await t()).estado).toBe("en_curso");
  });

  it("abonos: suman el anticipo y se pueden borrar", async () => {
    expect((await pedir("POST", `/presupuestos/${id}/pagos`, { fecha: "2026-03-10", monto: 0, forma: "efectivo" })).status).toBe(400);
    expect((await pedir("POST", `/presupuestos/${id}/pagos`, { fecha: "2026-03-10", monto: 3000, forma: "efectivo", nota: "Primer abono" })).status).toBe(201);
    await pedir("POST", `/presupuestos/${id}/pagos`, { fecha: "2026-03-20", monto: 2500.5, forma: "transferencia" });
    let p = (await pedir("GET", `/presupuestos/${id}`)).json;
    expect(p.anticipo).toBe(5500.5);
    expect(p.pagos.map((g: any) => [g.monto, g.forma, g.creadoPor])).toEqual([[3000, "efectivo", "Admin"], [2500.5, "transferencia", "Admin"]]);
    // Guardar el presupuesto no toca el anticipo.
    await pedir("PUT", `/presupuestos/${id}`, base([linea("Pintura afuera", 8500, { productoId })], { cerradoEn: 8000, fecha: "2026-03-05", anticipo: null }));
    expect((await pedir("GET", `/presupuestos/${id}`)).json.anticipo).toBe(5500.5);
    expect((await pedir("GET", `/trabajos/${trabajoId}`)).json.abonado).toBe(5500.5);

    for (const g of p.pagos) await pedir("DELETE", `/presupuestos/${id}/pagos/${g.id}`);
    p = (await pedir("GET", `/presupuestos/${id}`)).json;
    expect([p.anticipo, p.pagos.length]).toEqual([null, 0]);
    expect((await pedir("DELETE", `/presupuestos/${id}/pagos/99999`)).status).toBe(404);
  });

  it("la lista trae cliente, bus y documento", async () => {
    const { json } = await pedir<any[]>("GET", "/presupuestos");
    expect(json).toHaveLength(3);
    expect(json.find((p) => p.id === id)).toMatchObject({ cliente: "Cliente Inventado", bus: "La Prueba", estado: "terminado", total: 8500 });
  });

  it("borrar el único borrador de un trabajo borra el trabajo", async () => {
    const r = await pedir("POST", "/presupuestos", base([], { clienteId }));
    expect((await pedir("DELETE", `/presupuestos/${r.json.id}`)).status).toBe(200);
    expect((await pedir("GET", `/trabajos/${r.json.trabajoId}`)).status).toBe(404);
    // El cliente queda con un solo trabajo.
    expect((await pedir("GET", `/clientes/${clienteId}`)).json.trabajos).toHaveLength(1);
  });
});

describe("ajustes", () => {
  it("todos leen, solo el admin cambia", async () => {
    expect((await pedir("GET", "/configuracion", undefined, "editora@ejemplo.com")).json.nota).toMatch(/^NOTA/);
    expect((await pedir("PUT", "/configuracion", { firma: "X" }, "editora@ejemplo.com")).status).toBe(403);
    expect((await pedir("PUT", "/configuracion", { logo: "data:text/html;base64,AAAA" })).status).toBe(400);
    const r = await pedir("PUT", "/configuracion", { firma: "Firma Inventada", telefono: "0000-0000", logo: "data:image/png;base64,iVBORw0KGgo=" });
    expect(r.json).toMatchObject({ firma: "Firma Inventada", telefono: "0000-0000", empresa: "" });
    await pedir("PUT", "/configuracion", { firma: "Otra Firma" });
    expect((await pedir("GET", "/configuracion")).json).toMatchObject({ firma: "Otra Firma", telefono: "0000-0000" });
  });
});
