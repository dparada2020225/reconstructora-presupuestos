import { describe, expect, it } from "vitest";
import { claveCliente, claveProducto, clavePar, normalizarPlaca, posiblesDuplicados } from "./claves";

/** Nombres inventados. */
describe("claves", () => {
  it("clientes y productos", () => {
    expect(claveCliente("Extras Pedro Inventado 2")).toBe("pedro inventado");
    expect(claveCliente("Transporte Lucerito S.A.")).toBe("transportes lucerito");
    expect(claveProducto("Pintura por fuera")).toBe(claveProducto("pintura afuera"));
  });

  it("placas", () => {
    expect(normalizarPlaca("c 123 abc")).toBe("C-123ABC");
    expect(normalizarPlaca("C-123ABC")).toBe("C-123ABC");
    expect(normalizarPlaca(" sin placa aún ")).toBe("SIN PLACA AÚN");
  });
});

describe("posiblesDuplicados", () => {
  const p = (id: number, nombre: string) => ({ id, nombre });
  const clave = (x: { nombre: string }) => claveProducto(x.nombre);
  const items = [
    p(1, "Grada atrás bomper"),
    p(2, "Grada bomper atrás"),
    p(3, "Sistema eléctrico + accesorios"),
    p(4, "Sistema electrico más accesorios"),
    p(5, "Pintura por fuera"),
    p(6, "Pintura por fuera (poliuretano)"),
    p(7, "Accesorios"),
    p(8, "Escaleras cromadas"),
  ];

  it("encuentra los que son lo mismo escrito distinto", () => {
    const pares = posiblesDuplicados(items, clave).map((x) => clavePar(x.a.id, x.b.id));
    expect(pares).toEqual(expect.arrayContaining(["1-2", "3-4", "5-6"]));
    // Muy distintos de largo: no se sugiere.
    expect(pares.some((x) => x.includes("7"))).toBe(false);
    expect(pares.some((x) => x.includes("8"))).toBe(false);
  });

  it("no vuelve a sugerir los descartados", () => {
    const pares = posiblesDuplicados(items, clave, new Set(["1-2"]));
    expect(pares.map((x) => clavePar(x.a.id, x.b.id))).not.toContain("1-2");
  });
});
