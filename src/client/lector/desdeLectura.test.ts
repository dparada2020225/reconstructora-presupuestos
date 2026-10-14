import { describe, expect, it } from "vitest";
import { normalizarLectura } from "../../shared/lector";
import { seccionVacia, totalEditor, type EditorEstado } from "../editor/modelo";
import { emparejarBus, emparejarCliente, estadoDesdeLectura, vocabularioDe } from "./desdeLectura";

/** Datos inventados. */
const clientes = [
  { id: 1, nombre: "Transportes La Inventada", alias: ["la inventada"] },
  { id: 2, nombre: "Beto Ficticio", alias: [] },
];
const buses = [
  { id: 10, nombre: "Lucero", placa: null, clienteId: 2 },
  { id: 11, nombre: null, placa: "C-123ABC", clienteId: 2 },
  { id: 12, nombre: "Lucero", placa: null, clienteId: 1 },
];
const base: EditorEstado = {
  clienteId: null, busId: null, titulo: "", fecha: "2026-10-13", lugar: "Pueblo", cerradoEn: "", anticipo: "", notas: "", notaPie: "", secciones: [seccionVacia()],
};

describe("emparejar", () => {
  it("cliente igual sin tildes ni 'Trans', o muy parecido", () => {
    expect(emparejarCliente("Trans. La Inventada", clientes)).toMatchObject({ id: 1, exacto: true });
    expect(emparejarCliente("beto fictisio", clientes)).toMatchObject({ id: 2, exacto: false });
    expect(emparejarCliente("Otra Persona", clientes)).toBeNull();
    expect(emparejarCliente(null, clientes)).toBeNull();
  });
  it("bus del cliente por placa o nombre", () => {
    expect(emparejarBus({ placa: "c 123 abc", bus: null }, buses, 2)?.id).toBe(11);
    expect(emparejarBus({ placa: null, bus: "El Lucero" }, buses, 2)?.id).toBe(10);
    expect(emparejarBus({ placa: null, bus: "Lucero" }, buses, null)).toBeNull();
  });
  it("vocabulario: los más usados y activos", () => {
    expect(vocabularioDe([{ nombre: "A", activo: true, veces: 1 }, { nombre: "B", activo: true, veces: 9 }, { nombre: "C", activo: false, veces: 99 }])).toEqual(["B", "A"]);
  });
});

describe("estadoDesdeLectura", () => {
  const lectura = normalizarLectura({
    cliente: "Beto Ficticio",
    bus: "Lucero",
    fecha: "2026-03-02",
    secciones: [
      { titulo: "ADENTRO", totalEscrito: 3000, lineas: [{ descripcion: "4 sillas nuevas", precio: 2000 }, { descripcion: "Bocinas", precio: 500, cadaUno: true, cantidad: 2, detalles: ["negras"] }] },
    ],
    cerradoEn: 2800,
  });

  it("llena el editor: cliente, bus, fecha, secciones y cerrado en", () => {
    const r = estadoDesdeLectura(base, lectura, { origen: "fotos con Cloudflare · Gemma 4", esExtra: false, clientes, buses });
    expect(r.inicial).toMatchObject({ clienteId: 2, busId: 10, fecha: "2026-03-02", lugar: "Pueblo", cerradoEn: "2800" });
    expect(r.inicial.notas).toContain("Cloudflare");
    const [s] = r.inicial.secciones;
    expect(s.titulo).toBe("ADENTRO");
    // El total del renglón va con cantidad 1; "c/u" con su cantidad.
    expect(s.lineas.map((l) => [l.descripcion, l.cantidad, l.precioUnitario])).toEqual([["4 sillas nuevas", "1", "2000"], ["Bocinas", "2", "500"]]);
    expect(s.lineas[1].detalles.map((d) => d.texto)).toEqual(["negras"]);
    expect(totalEditor(r.inicial)).toBe(3000);
    expect(r.avisos).toEqual([]);
  });

  it("avisa si el cliente no está y no toca cliente/bus en un extra", () => {
    const otro = { ...lectura, cliente: "Persona Nueva" };
    const r = estadoDesdeLectura(base, otro, { origen: "texto de Claude", esExtra: false, clientes, buses });
    expect(r.inicial.clienteId).toBeNull();
    expect(r.avisos[0].texto).toContain("Persona Nueva");
    expect(r.clienteEscrito).toBe("Persona Nueva");
    // No está: se crea al guardar, con su bus.
    expect(r.nuevos).toEqual({ cliente: "Persona Nueva", bus: { nombre: "Lucero", placa: null } });
    const extra = estadoDesdeLectura({ ...base, clienteId: 1 }, otro, { origen: "texto de Claude", esExtra: true, clientes, buses });
    expect(extra.inicial.clienteId).toBe(1);
    expect(extra.avisos).toEqual([]);
    expect(extra.nuevos).toEqual({ cliente: null, bus: null });
  });
});
