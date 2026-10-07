import { describe, expect, it } from "vitest";
import { montoEnTexto, parseQuetzales } from "./dinero";
import { parseFechaEs } from "./fechas";
import { mensajeCompartir } from "./presupuesto";
import { limpiarDescripcion, normalizar, similitud } from "./texto";

describe("parseQuetzales", () => {
  it.each([
    [8000, 8000],
    ["Q.8,000,-", 8000],
    ["Q,900,-", 900],
    ["Q:6,175,-", 6175],
    ["Q1,800,-", 1800],
    ["Q.225.-", 225],
    ["Q 1,140.50", 1140.5],
    ["Q.33,075,-", 33075],
    ["?", null],
    ["", null],
    ["hola", null],
  ])("%s → %s", (entrada, esperado) => {
    expect(parseQuetzales(entrada)).toBe(esperado);
  });

  it("encuentra el monto dentro de un sub-item", () => {
    expect(montoEnTexto("a. 1 solenoide…………………Q.115,-")).toBe(115);
    expect(montoEnTexto("8 luces intermitentes Q.225.-")).toBe(225);
    expect(montoEnTexto("Sin precio")).toBeNull();
  });
});

describe("parseFechaEs", () => {
  it.each([
    ["Ciudad Vieja Sacatepéquez, lunes 13 de noviembre del 2023.", "2023-11-13"],
    ["         Ciudad Vieja Sacatepèquez 23 de julio del 2,018,", "2018-07-23"],
    ["Ciudad Vieja Sacatepéquez, 28 de octubredel 2024.", "2024-10-28"],
    ["Ciudad Vieja Sacatepéquez, 16 de olctubre del 2024.", "2024-10-16"],
    ["Ciudad Vieja Sacatepéquez, octubre del 2023", "2023-10-01"],
    ["Ciudad Vieja Sacatepéquez, 15 mayo del 2025.", "2025-05-15"],
    ["Pueblo Nuevo Viñas, miércoles 23 de junio 2021.", "2021-06-23"],
    ["Lugar y fecha:", null],
  ])("%s → %s", (entrada, esperado) => {
    expect(parseFechaEs(entrada)).toBe(esperado);
  });
});

describe("texto", () => {
  it("normaliza", () => {
    expect(normalizar("  Rodolfo  Ordoñes. ")).toBe("rodolfo ordones");
    expect(normalizar("Pintura (poliuretano)")).toBe("pintura poliuretano");
  });
  it("limpia rellenos", () => {
    expect(limpiarDescripcion("Corte a 9 filas.............................")).toBe("Corte a 9 filas");
    expect(limpiarDescripcion("Pintura bus (poliuretano)……………………….")).toBe("Pintura bus (poliuretano)");
    expect(limpiarDescripcion("* Bocelitos de en medio - Boceles de bomper ")).toBe(
      "Bocelitos de en medio - Boceles de bomper",
    );
  });
  it("similitud", () => {
    expect(similitud("mrio lopez", "mario lopez")).toBeGreaterThan(0.9);
    // Ismael ≠ Israel pero se parecen igual que un error de dedo:
    // por eso el ETL solo SUGIERE fusiones por similitud, nunca las aplica solo.
    expect(similitud("ismael gomez", "israel gomez")).toBeGreaterThan(0.9);
  });
});

describe("mensajeCompartir", () => {
  it("arma el mensaje que acompaña al PDF (datos inventados)", () => {
    expect(mensajeCompartir({ cliente: "Ana ", placa: "C-123ABC", bus: "La Prueba", tipo: "original", numero: 0 })).toBe("Presupuesto de Ana – C-123ABC / La Prueba");
    expect(mensajeCompartir({ cliente: "Ana", placa: null, bus: "La Prueba", tipo: "extra", numero: 2 })).toBe("Presupuesto de Ana – La Prueba (Extra 2)");
    expect(mensajeCompartir({ cliente: "Ana", placa: null, bus: null, unificado: true })).toBe("Trabajo completo de Ana");
  });
});
