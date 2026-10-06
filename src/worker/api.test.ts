import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { cargarHistorico } from "../../scripts/etl/cargar";
import type { Historico, PresupuestoFinal } from "../../scripts/etl/tipos";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";
import { crearApp } from "./app";
import type { Env } from "./env";

/** Datos inventados: el repo es público. */
const pres = (fecha: string, items: [string, number, string | null][]): PresupuestoFinal => ({
  tipo: "original",
  numero: 0,
  titulo: "x",
  fecha,
  lugar: null,
  total: items.reduce((a, i) => a + i[1], 0),
  totalEscrito: null,
  cerradoEn: null,
  anticipo: null,
  origenRefs: ["prueba"],
  items: items.map(([descripcion, precio, producto], orden) => ({
    orden, seccion: "AFUERA", descripcion, cantidad: 1, precioUnitario: null, precio, precioPendiente: false, producto, hijos: [],
  })),
});

const historico: Historico = {
  generado: "x",
  clientes: [
    { nombre: "Ana Prueba", alias: ["ana prueba"] },
    { nombre: "Anna Prueba", alias: ["anna prueba"] },
    { nombre: "Beto Ficticio", alias: ["beto ficticio"] },
  ],
  buses: [
    { cliente: "Ana Prueba", placa: null, nombre: "Lucero" },
    { cliente: "Anna Prueba", placa: "C-111AAA", nombre: null },
  ],
  productos: [
    { nombre: "Pintura afuera", categoria: "AFUERA", alias: ["pintura afuera"], veces: 2 },
    { nombre: "Pintura por fuera (poliuretano)", categoria: null, alias: ["pintura afuera poliuretano"], veces: 2 },
  ],
  trabajos: [
    { clave: "1", cliente: "Ana Prueba", bus: { placa: null, nombre: "Lucero" }, estado: "terminado", fechaInicio: "2023-01-10", fechaFin: null, precioCerrado: null,
      presupuestos: [pres("2023-01-10", [["Pintura afuera", 5000, "Pintura afuera"]])] },
    { clave: "2", cliente: "Anna Prueba", bus: { placa: "C-111AAA", nombre: null }, estado: "terminado", fechaInicio: "2024-02-10", fechaFin: null, precioCerrado: null,
      presupuestos: [pres("2024-02-10", [["Pintura por fuera poliuretano", 7000, "Pintura por fuera (poliuretano)"], ["Pintura afuera", 6000, "Pintura afuera"]])] },
  ],
};

let db: Db;
const app = crearApp(() => db);
const env = { DEV_AUTH_EMAIL: "admin@ejemplo.com" } as unknown as Env;

async function pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown, correo = "admin@ejemplo.com") {
  const res = await app.request(
    `/api${ruta}`,
    { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) },
    { ...env, DEV_AUTH_EMAIL: correo },
  );
  return { status: res.status, json: (await res.json()) as T };
}

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema: s }) as unknown as Db;
  await migrate(db as any, { migrationsFolder: "./drizzle" });
  await db.insert(s.usuarios).values({ email: "admin@ejemplo.com", nombre: "Admin", rol: "admin", estado: "activo" });
  await cargarHistorico(db as any, historico);
});

const idDe = async (ruta: string, campo: string, valor: unknown) =>
  (await pedir<any[]>("GET", ruta)).json.find((x) => x[campo] === valor)!.id as number;

describe("acceso", () => {
  it("quien no está autorizado no ve nada", async () => {
    const r = await pedir("GET", "/clientes", undefined, "nuevo@ejemplo.com");
    expect(r.status).toBe(403);
  });
});

describe("clientes", () => {
  it("lista con conteos", async () => {
    const { json } = await pedir<any[]>("GET", "/clientes");
    expect(json.map((c) => c.nombre)).toEqual(["Ana Prueba", "Anna Prueba", "Beto Ficticio"]);
    expect(json[0]).toMatchObject({ trabajos: 1, buses: 1, ultima: "2023-01-10", alias: ["ana prueba"] });
  });

  it("crear, editar y borrar; no deja repetir nombres", async () => {
    expect((await pedir("POST", "/clientes", { nombre: "  " })).status).toBe(400);
    const rep = await pedir("POST", "/clientes", { nombre: "ana  PRUEBA." });
    expect(rep.status).toBe(409);
    expect(rep.json.error).toContain("Ana Prueba");

    const { status, json } = await pedir("POST", "/clientes", { nombre: "Carla Inventada", telefono: "5555-0000" });
    expect(status).toBe(201);
    expect((await pedir("PATCH", `/clientes/${json.id}`, { telefono: "", notas: "Paga al contado" })).status).toBe(200);
    const det = await pedir("GET", `/clientes/${json.id}`);
    expect(det.json).toMatchObject({ telefono: null, notas: "Paga al contado", trabajos: [], buses: [] });
    expect((await pedir("PATCH", `/clientes/${json.id}`, { nombre: "Beto Ficticio" })).status).toBe(409);
    expect((await pedir("DELETE", `/clientes/${json.id}`)).status).toBe(200);
    expect((await pedir("GET", `/clientes/${json.id}`)).status).toBe(404);
  });

  it("no borra un cliente con trabajos", async () => {
    const id = await idDe("/clientes", "nombre", "Beto Ficticio");
    // Beto no tiene trabajos en el histórico: se puede borrar. Ana sí tiene.
    const ana = await idDe("/clientes", "nombre", "Ana Prueba");
    const r = await pedir("DELETE", `/clientes/${ana}`);
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/1 trabajo/);
    expect((await pedir("DELETE", `/clientes/${id}`)).status).toBe(200);
  });

  it("descartar un par y unir dos clientes", async () => {
    const ana = await idDe("/clientes", "nombre", "Ana Prueba");
    const anna = await idDe("/clientes", "nombre", "Anna Prueba");
    await pedir("POST", "/clientes/duplicados/descartados", { aId: anna, bId: ana });
    expect((await pedir("GET", "/clientes/duplicados/descartados")).json).toEqual([{ aId: Math.min(ana, anna), bId: Math.max(ana, anna) }]);

    expect((await pedir("POST", `/clientes/${ana}/unir`, { otroId: ana })).status).toBe(400);
    expect((await pedir("POST", `/clientes/${ana}/unir`, { otroId: anna })).status).toBe(200);
    const det = await pedir("GET", `/clientes/${ana}`);
    expect(det.json.trabajos).toHaveLength(2);
    expect(det.json.trabajos[0]).toMatchObject({ fecha: "2024-02-10", monto: 13000 });
    expect(det.json.buses).toHaveLength(2);
    expect(det.json.alias.sort()).toEqual(["ana prueba", "anna prueba"]);
    expect((await pedir("GET", `/clientes/${anna}`)).status).toBe(404);
    expect((await pedir("GET", "/clientes/duplicados/descartados")).json).toEqual([]);
  });
});

describe("buses", () => {
  it("valida, normaliza la placa y no la deja repetir", async () => {
    expect((await pedir("POST", "/buses", { notas: "x" })).status).toBe(400);
    const r = await pedir("POST", "/buses", { placa: "c 222 bbb", nombre: "Nuevo" });
    expect(r.status).toBe(201);
    expect((await pedir("GET", `/buses/${r.json.id}`)).json).toMatchObject({ placa: "C-222BBB", nombre: "Nuevo", trabajos: [] });
    const rep = await pedir("POST", "/buses", { placa: "C-222BBB" });
    expect(rep.status).toBe(409);
    expect((await pedir("PATCH", `/buses/${r.json.id}`, { placa: null, nombre: null })).status).toBe(400);
  });

  it("unir buses pasa los trabajos y la placa", async () => {
    const lucero = await idDe("/buses", "nombre", "Lucero");
    const conPlaca = await idDe("/buses", "placa", "C-111AAA");
    expect((await pedir("DELETE", `/buses/${lucero}`)).status).toBe(409);
    expect((await pedir("POST", `/buses/${lucero}/unir`, { otroId: conPlaca })).status).toBe(200);
    const det = await pedir("GET", `/buses/${lucero}`);
    expect(det.json).toMatchObject({ placa: "C-111AAA", nombre: "Lucero", cliente: "Ana Prueba" });
    expect(det.json.trabajos).toHaveLength(2);
  });
});

describe("productos", () => {
  it("lista con veces y último precio", async () => {
    const { json } = await pedir<any[]>("GET", "/productos");
    expect(json.find((p) => p.nombre === "Pintura afuera")).toMatchObject({ veces: 2, ultimoPrecio: 6000, ultimaFecha: "2024-02-10" });
  });

  it("detalle con historial de precios", async () => {
    const id = await idDe("/productos", "nombre", "Pintura afuera");
    const { json } = await pedir("GET", `/productos/${id}`);
    expect(json.veces).toBe(2);
    expect(json.usos.map((u: any) => [u.fecha, u.unitario])).toEqual([["2024-02-10", 6000], ["2023-01-10", 5000]]);
    expect(json.porAnio).toEqual([{ anio: "2023", mediana: 5000, n: 1 }, { anio: "2024", mediana: 6000, n: 1 }]);
  });

  it("crear, desactivar y no repetir", async () => {
    expect((await pedir("POST", "/productos", { nombre: "pintura por fuera" })).status).toBe(409);
    const r = await pedir("POST", "/productos", { nombre: "Bocina de prueba", categoria: "audio", precioReferencia: 450.5 });
    expect(r.status).toBe(201);
    await pedir("PATCH", `/productos/${r.json.id}`, { activo: false, precioReferencia: null });
    expect((await pedir("GET", `/productos/${r.json.id}`)).json).toMatchObject({ categoria: "AUDIO", activo: false, precioReferencia: null, veces: 0 });
    expect((await pedir("DELETE", `/productos/${r.json.id}`)).status).toBe(200);
  });

  it("unir productos pasa sus líneas; no deja borrar uno usado", async () => {
    const a = await idDe("/productos", "nombre", "Pintura afuera");
    const b = await idDe("/productos", "nombre", "Pintura por fuera (poliuretano)");
    expect((await pedir("DELETE", `/productos/${b}`)).status).toBe(409);
    expect((await pedir("POST", `/productos/${a}/unir`, { otroId: b })).status).toBe(200);
    const { json } = await pedir("GET", `/productos/${a}`);
    expect(json.veces).toBe(3);
    expect(json.alias.sort()).toEqual(["pintura afuera", "pintura afuera poliuretano"]);
    expect((await pedir("GET", `/productos/${b}`)).status).toBe(404);
  });
});
