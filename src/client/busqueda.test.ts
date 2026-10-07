import { describe, expect, it } from "vitest";
import type { BusFila, ClienteFila, PresupuestoFila, ProductoFila } from "./api";
import { buscarTodo, puntaje } from "./busqueda";

/** Datos inventados. */
const presupuesto = (id: number, cliente: string, extra: Partial<PresupuestoFila> = {}): PresupuestoFila => ({
  id, trabajoId: id, tipo: "original", numero: 0, titulo: null, fecha: "2026-01-01", estado: "cotizacion", total: 100, cerradoEn: null,
  origen: "app", actualizadoEn: "2026-01-01", estadoTrabajo: "cotizado", clienteId: 1, cliente, busId: null, bus: null, placa: null, ...extra,
});
const cliente = (id: number, nombre: string, trabajos = 1, alias: string[] = []): ClienteFila => ({ id, nombre, telefono: null, notas: null, buses: 0, trabajos, ultima: null, alias });
const bus = (id: number, placa: string | null, nombre: string | null): BusFila => ({ id, placa, nombre, descripcion: null, notas: null, clienteId: 1, cliente: "Transportes Inventados", trabajos: 2, ultima: null });
const producto = (id: number, nombre: string, veces: number, activo = true): ProductoFila => ({
  id, nombre, categoria: null, precioReferencia: null, unidad: null, activo, veces, ultimaFecha: null, ultimoPrecio: null, alias: [],
});

describe("puntaje", () => {
  it("sin tildes, todas las palabras, y mejor si empieza igual", () => {
    expect(puntaje("jose", "José Pérez")).toBe(3);
    expect(puntaje("perez", "José Pérez")).toBe(2);
    expect(puntaje("rez", "José Pérez")).toBe(1);
    expect(puntaje("jose lopez", "José Pérez")).toBe(0);
    expect(puntaje("", "José Pérez")).toBe(0);
    expect(puntaje("azul", "Tapizado", "azul marino")).toBe(2);
  });
});

describe("buscarTodo", () => {
  const datos = {
    presupuestos: [
      presupuesto(10, "Ana Prueba", { fecha: "2025-05-01", bus: "La Veloz" }),
      presupuesto(11, "Ana Prueba", { fecha: "2026-02-01", tipo: "extra", numero: 1, bus: "La Veloz" }),
      presupuesto(12, "Beto Ejemplo", { placa: "C-123ABC" }),
    ],
    clientes: [cliente(1, "Ana Prueba", 2), cliente(2, "Mariana Ejemplo", 9, ["la ana"])],
    buses: [bus(1, "C-123ABC", "La Veloz"), bus(2, null, "El Lento")],
    productos: [producto(1, "Pintura de sillas", 30), producto(2, "Pintura viejo", 99, false), producto(3, "Sillas reclinables", 5)],
  };

  it("vacío no busca nada", () => {
    expect(buscarTodo(datos, "  ")).toEqual([]);
  });

  it("agrupa por tipo; presupuestos más recientes primero", () => {
    const r = buscarTodo(datos, "ana");
    expect(r.filter((x) => x.tipo === "presupuesto").map((x) => x.id)).toEqual([11, 10]);
    expect(r[0]).toMatchObject({ titulo: "Ana Prueba · Extra 1", ruta: "/presupuestos/11" });
    // El que empieza con "ana" va antes aunque el otro tenga más trabajos (lo encuentra por alias).
    expect(r.filter((x) => x.tipo === "cliente").map((x) => x.id)).toEqual([1, 2]);
  });

  it("por placa, bus y número de presupuesto", () => {
    expect(buscarTodo(datos, "c-123").map((x) => `${x.tipo}${x.id}`)).toEqual(["presupuesto12", "bus1"]);
    expect(buscarTodo(datos, "#12")[0]).toMatchObject({ tipo: "presupuesto", id: 12 });
    expect(buscarTodo(datos, "lento")).toEqual([expect.objectContaining({ tipo: "bus", id: 2, titulo: "El Lento" })]);
  });

  it("productos activos, los más usados primero", () => {
    expect(buscarTodo(datos, "sillas").filter((x) => x.tipo === "producto").map((x) => x.id)).toEqual([3, 1]);
    expect(buscarTodo(datos, "pintura").filter((x) => x.tipo === "producto").map((x) => x.id)).toEqual([1]);
  });
});
