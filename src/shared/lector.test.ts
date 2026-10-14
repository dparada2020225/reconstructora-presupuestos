import { describe, expect, it } from "vitest";
import { extraerJson, instrucciones, normalizarLectura, revisarLectura, sumaSeccionLeida } from "./lector";

/** Datos inventados. */
describe("extraerJson", () => {
  it("acepta el JSON envuelto en ```json o con texto alrededor", () => {
    expect(extraerJson('```json\n{"cliente":"Ana"}\n```')).toEqual({ cliente: "Ana" });
    expect(extraerJson('Aquí está:\n{"a":{"b":1}}\nListo.')).toEqual({ a: { b: 1 } });
  });
  it("explica si no hay JSON o está cortado", () => {
    expect(() => extraerJson("No pude leer la foto")).toThrow(/no hay JSON/);
    expect(() => extraerJson('{"cliente":"Ana",')).toThrow(/no hay JSON|mal formado/);
    expect(() => extraerJson('{"cliente": Ana}')).toThrow(/mal formado/);
  });
});

describe("normalizarLectura", () => {
  it("limpia montos en texto, quita RESUMEN y TOTAL y respeta c/u", () => {
    const l = normalizarLectura({
      cliente: "Cliente: Beto Ficticio",
      bus: "La Inventada",
      placa: null,
      fecha: "2026-03-02",
      lugar: "Pueblo",
      secciones: [
        {
          titulo: "adentro",
          totalEscrito: "Q.1,500.-",
          lineas: [
            { descripcion: "- Pintar techo", precio: "Q1,000", detalles: ["* color azul", "a. con brillo"] },
            { descripcion: "Sillas nuevas", precio: 250, cadaUno: true, cantidad: 2 },
            { descripcion: "TOTAL", precio: 1500 },
            { descripcion: "Bocina", precio: "?" },
            { descripcion: "", precio: null },
          ],
        },
        { titulo: "RESUMEN", lineas: [{ descripcion: "ADENTRO", precio: 1500 }] },
        { titulo: "AFUERA", lineas: [] },
      ],
      cerradoEn: "1,400",
      anticipo: "nada",
      dudas: ["", "no se lee una palabra"],
    });
    expect(l.cliente).toBe("Beto Ficticio");
    expect(l.fecha).toBe("2026-03-02");
    expect(l.secciones).toHaveLength(1);
    const s = l.secciones[0];
    expect(s.titulo).toBe("ADENTRO");
    expect(s.totalEscrito).toBe(1500);
    expect(s.lineas.map((x) => x.descripcion)).toEqual(["Pintar techo", "Sillas nuevas", "Bocina"]);
    expect(s.lineas[0]).toMatchObject({ precio: 1000, cadaUno: false, cantidad: 1, detalles: ["color azul", "con brillo"] });
    expect(s.lineas[1]).toMatchObject({ precio: 250, cadaUno: true, cantidad: 2 });
    expect(s.lineas[2]).toMatchObject({ precio: null, precioPendiente: true });
    expect(sumaSeccionLeida(s)).toBe(1500);
    expect(l.cerradoEn).toBe(1400);
    expect(l.anticipo).toBeNull();
    expect(l.dudas).toEqual(["no se lee una palabra"]);
  });

  it("aguanta respuestas raras sin romperse", () => {
    expect(normalizarLectura(null)).toMatchObject({ cliente: null, secciones: [], dudas: [] });
    expect(normalizarLectura({ fecha: "31/02/2026", secciones: "x" }).fecha).toBeNull();
    expect(normalizarLectura({ secciones: [{ lineas: ["Solo texto"] }] }).secciones[0].lineas[0]).toMatchObject({ descripcion: "Solo texto", precio: null });
  });
});

describe("revisarLectura", () => {
  it("avisa sumas que no cuadran, palabras dudosas y renglones sin precio", () => {
    const avisos = revisarLectura(
      normalizarLectura({
        secciones: [
          { titulo: "ADENTRO", totalEscrito: 2000, lineas: [{ descripcion: "Pintar [?]", precio: 1500 }, { descripcion: "Limpiar", precio: null }] },
          { titulo: "AFUERA", totalEscrito: 300, lineas: [{ descripcion: "Luces", precio: 300 }] },
        ],
        dudas: ["Pintar [?]", "la fecha está borrosa"],
      }),
    );
    expect(avisos.map((a) => a.tipo)).toEqual(["suma", "sinPrecio", "duda", "duda"]);
    expect(avisos[0].texto).toContain("Q1,500.00");
    expect(avisos[0].texto).toContain("Q2,000.00");
    expect(avisos.at(-1)!.texto).toBe("la fecha está borrosa");
  });
  it("sin renglones", () => {
    expect(revisarLectura(normalizarLectura({}))[0].tipo).toBe("vacio");
  });
});

it("las instrucciones llevan el vocabulario del catálogo", () => {
  expect(instrucciones(["Forrar techo", "Bomper"])).toContain("Forrar techo; Bomper");
  expect(instrucciones()).not.toContain("Nombres de trabajos");
});
