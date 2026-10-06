import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { cargarHistorico } from "../../scripts/etl/cargar";
import type { Historico, PresupuestoFinal } from "../../scripts/etl/tipos";
import { montoTrabajo } from "../shared/estadisticas";
import { obtenerEstadisticas } from "./estadisticas";
import * as s from "./schema";

/** Datos inventados. */
const pres = (tipo: "original" | "extra", fecha: string, items: [string, number, string | null][], cerradoEn: number | null = null): PresupuestoFinal => ({
  tipo,
  numero: 0,
  titulo: "x",
  fecha,
  lugar: null,
  total: items.reduce((a, i) => a + i[1], 0),
  totalEscrito: null,
  cerradoEn,
  anticipo: null,
  origenRefs: ["prueba"],
  items: items.map(([descripcion, precio, producto], orden) => ({
    orden, seccion: "AFUERA", descripcion, cantidad: 1, precioUnitario: null, precio, precioPendiente: false, producto, hijos: [],
  })),
});

const h: Historico = {
  generado: "x",
  clientes: [{ nombre: "Ana", alias: ["ana"] }, { nombre: "Beto", alias: ["beto"] }],
  buses: [{ cliente: "Ana", placa: "C-111AAA", nombre: "Uno" }],
  productos: [{ nombre: "Pintura", categoria: "AFUERA", alias: ["pintura"], veces: 3 }],
  trabajos: [
    { clave: "a1", cliente: "Ana", bus: { placa: "C-111AAA", nombre: "Uno" }, estado: "terminado", fechaInicio: "2023-03-01", fechaFin: null, precioCerrado: 9000,
      presupuestos: [pres("original", "2023-03-01", [["Pintura", 6000, "Pintura"], ["Luces", 4000, null]], 9000), pres("extra", "2023-04-01", [["Pintura", 2000, "Pintura"]])] },
    { clave: "a2", cliente: "Ana", bus: null, estado: "terminado", fechaInicio: "2024-05-01", fechaFin: null, precioCerrado: null,
      presupuestos: [pres("original", "2024-05-01", [["Pintura", 8000, "Pintura"]])] },
    { clave: "b1", cliente: "Beto", bus: null, estado: "terminado", fechaInicio: "2024-06-01", fechaFin: null, precioCerrado: null,
      presupuestos: [pres("original", "2024-06-01", [["Escaleras", 1000, null]])] },
  ],
};

describe("montoTrabajo", () => {
  it("cerrado en reemplaza lo anterior y suma lo de después", () => {
    expect(montoTrabajo([{ total: 10000, cerradoEn: 9000 }, { total: 2000, cerradoEn: null }])).toEqual({ cotizado: 12000, final: 11000, rebaja: 0.1 });
    expect(montoTrabajo([{ total: 500, cerradoEn: null }]).final).toBe(500);
  });
});

describe("obtenerEstadisticas", () => {
  it("calcula resumen, series y rankings", async () => {
    const db = drizzle(new PGlite(), { schema: s });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await cargarHistorico(db, h);

    const e = await obtenerEstadisticas(db);
    expect(e.anios).toEqual(["2023", "2024"]);
    expect(e.resumen).toMatchObject({
      clientes: 2, clientesRecurrentes: 1, trabajos: 3, presupuestos: 4, lineas: 5,
      totalCotizado: 21000, totalFinal: 20000, trabajosConExtras: 1, montoExtras: 2000, buses: 1, busesConPlaca: 1,
    });
    expect(e.porAnio.map((a) => [a.anio, a.trabajos, a.monto])).toEqual([["2023", 1, 12000], ["2024", 2, 9000]]);
    expect(e.porMes[2]).toBe(1); // marzo
    expect(e.clientes[0]).toMatchObject({ nombre: "Ana", trabajos: 2, monto: 19000 });
    expect(e.productos[0]).toMatchObject({ nombre: "Pintura", veces: 3, monto: 16000 });
    expect(e.precios.map((p) => [p.anio, p.mediana])).toEqual([["2023", 4000], ["2024", 8000]]);

    const solo2024 = await obtenerEstadisticas(db, { desde: "2024", hasta: "2024" });
    expect(solo2024.resumen.trabajos).toBe(2);
    expect(solo2024.anios).toEqual(["2023", "2024"]);
  });
});
