import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import * as s from "../../src/db/schema";
import { cargarHistorico } from "./cargar";
import type { Historico } from "./tipos";

/** Datos inventados: el repo es público y nunca lleva datos reales. */
const ejemplo: Historico = {
  generado: "2026-01-01T00:00:00Z",
  clientes: [
    { nombre: "Cliente Uno", alias: ["cliente uno"] },
    { nombre: "Transportes Dos", alias: ["transportes dos"] },
  ],
  buses: [
    { cliente: "Cliente Uno", placa: "C-123ABC", nombre: "La Prueba" },
    { cliente: "Transportes Dos", placa: null, nombre: "Estrella" },
  ],
  productos: [{ nombre: "Pintura afuera", categoria: "AFUERA", alias: ["pintura afuera"], veces: 2 }],
  trabajos: [
    {
      clave: "cliente uno#2025-01-10",
      cliente: "Cliente Uno",
      bus: { placa: "C-123ABC", nombre: "La Prueba" },
      estado: "terminado",
      fechaInicio: "2025-01-10",
      fechaFin: null,
      precioCerrado: 9000,
      presupuestos: [
        {
          tipo: "original",
          numero: 0,
          titulo: "CLIENTE UNO",
          fecha: "2025-01-10",
          lugar: "Ciudad Vieja",
          total: 10000,
          totalEscrito: 10000,
          cerradoEn: 9000,
          anticipo: null,
          origenRefs: ["prueba"],
          items: [
            {
              orden: 0,
              seccion: "AFUERA",
              descripcion: "Pintura afuera",
              cantidad: 1,
              precioUnitario: null,
              precio: 7000,
              precioPendiente: false,
              producto: "Pintura afuera",
              hijos: [
                { orden: 0, seccion: "AFUERA", descripcion: "Poliuretano", cantidad: 1, precioUnitario: null, precio: null, precioPendiente: false, producto: null },
              ],
            },
            { orden: 1, seccion: "AFUERA", descripcion: "4 luces", cantidad: 4, precioUnitario: 750, precio: 3000, precioPendiente: false, producto: null, hijos: [] },
          ],
        },
        {
          tipo: "extra",
          numero: 1,
          titulo: "CLIENTE UNO EXTRAS",
          fecha: "2025-02-01",
          lugar: "Ciudad Vieja",
          total: 1500,
          totalEscrito: null,
          cerradoEn: null,
          anticipo: 500,
          origenRefs: ["prueba extras"],
          items: [
            { orden: 0, seccion: "EXTRAS", descripcion: "Pintura afuera", cantidad: 1, precioUnitario: null, precio: 1500, precioPendiente: false, producto: "Pintura afuera", hijos: [] },
          ],
        },
      ],
    },
    {
      clave: "transportes dos#2025-03-01",
      cliente: "Transportes Dos",
      bus: { placa: null, nombre: "Estrella" },
      estado: "terminado",
      fechaInicio: "2025-03-01",
      fechaFin: null,
      precioCerrado: null,
      presupuestos: [
        {
          tipo: "original",
          numero: 0,
          titulo: "DOS",
          fecha: "2025-03-01",
          lugar: null,
          total: 0,
          totalEscrito: null,
          cerradoEn: null,
          anticipo: null,
          origenRefs: ["dos"],
          items: [],
        },
      ],
    },
  ],
};

describe("cargarHistorico", () => {
  it("carga y es idempotente", async () => {
    const db = drizzle(new PGlite(), { schema: s });
    await migrate(db, { migrationsFolder: "./drizzle" });

    const r1 = await cargarHistorico(db, ejemplo);
    expect(r1).toMatchObject({ clientes: 2, buses: 2, productos: 1, trabajos: 2, presupuestos: 3, items: 4 });

    // Correrlo otra vez no duplica nada.
    await cargarHistorico(db, ejemplo);
    const [{ n: trabajos }] = await db.select({ n: count() }).from(s.trabajos);
    const [{ n: clientes }] = await db.select({ n: count() }).from(s.clientes);
    const [{ n: items }] = await db.select({ n: count() }).from(s.presupuestoItems);
    expect({ trabajos, clientes, items }).toEqual({ trabajos: 2, clientes: 2, items: 4 });

    const [hijo] = await db.select().from(s.presupuestoItems).where(eq(s.presupuestoItems.descripcion, "Poliuretano"));
    expect(hijo.parentId).not.toBeNull();

    const [prod] = await db.select().from(s.productos);
    // Mediana del precio unitario en el último año con datos (2025: 7000 y 1500).
    expect(prod.precioReferencia).toBe("4250.00");
  });
});
