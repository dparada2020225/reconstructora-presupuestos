import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";
import { nombrePestana, renglonesRespaldo } from "../shared/respaldo";
import { crearApp } from "./app";
import type { Env } from "./env";
import { celdas, contarPendientes, detectarPosiciones, olvidarCacheGoogle, respaldarPresupuesto } from "./respaldo";

/** Columnas A:B de una plantilla como la del Excel (filas desde la 1). */
function plantillaComo({ desplazar = 0 } = {}) {
  const v: string[][] = Array.from({ length: 60 + desplazar }, () => []);
  const pon = (fila: number, a: string, b = "") => (v[fila - 1 + desplazar] = [a, b]);
  pon(7, "Lugar y fecha:");
  pon(9, "Cliente:");
  pon(11, "No. Placa / transporte:");
  for (let f = 16; f <= 50; f++) pon(f, "-", "Ejemplo......");
  pon(51, "", "TOTAL......");
  pon(54, "NOTA: Los trabajos realizados…");
  pon(55, "Firma");
  return v;
}
const plantillaValores = plantillaComo();

/** Datos inventados. */
const item = (id: number, seccion: string | null, descripcion: string, precio: number | null, extra = {}) => ({
  id, parentId: null as number | null, orden: id, seccion, descripcion, cantidad: 1, precioUnitario: precio, precio, precioPendiente: false, ...extra,
});

describe("renglones y celdas", () => {
  it("secciones con TOTAL por fórmula, resumen y montos", () => {
    const r = renglonesRespaldo({
      id: 1, tipo: "original", numero: 0, fecha: "2026-03-02", cliente: "Ana", total: 1600, cerradoEn: 1500, anticipo: 500, documentosTrabajo: [],
      items: [item(1, "ADENTRO", "Pintura", 1000), { ...item(2, "ADENTRO", "Azul", null), parentId: 1 }, item(3, "AFUERA", "Luces", 600), item(4, "AFUERA", "Bocina", null, { precioPendiente: true })],
    });
    expect(r.map((x) => x.tipo)).toEqual(["titulo", "item", "detalle", "suma", "vacio", "titulo", "item", "item", "suma", "vacio", "titulo", "monto", "monto", "suma", "monto", "monto", "monto"]);
    const { filas, formatos } = celdas(r);
    // Fila 16 = título ADENTRO; 17 = Pintura; 18 = detalle; 19 = TOTAL de 17:18.
    expect(filas[1][0]).toBe("'-");
    expect(filas[1][3]).toBe(1000);
    expect(filas[3][3]).toBe('=SUMIF(A17:A18,"-",D17:D18)');
    expect(filas[8][3]).toBe('=SUMIF(A22:A23,"-",D22:D23)');
    expect(filas[7][3]).toBe("?");
    // TOTAL general suma solo las líneas con "-".
    expect(filas[13][3]).toBe('=SUMIF(A16:A28,"-",D16:D28)');
    expect(formatos.filter((f) => f.tipo === "verde").map((f) => f.fila)).toEqual([19, 24, 29, 30]);
  });

  it("textos que parecen fórmula se escriben como texto", () => {
    const { filas } = celdas([{ tipo: "item", texto: "+ accesorios", precio: 10 }]);
    expect(String(filas[0][1]).startsWith("'+ accesorios")).toBe(true);
  });

  it("nombre de la pestaña", () => {
    expect(nombrePestana({ id: 7, fecha: "2026-03-02", cliente: "Ana / Pérez", tipo: "extra", numero: 2 })).toBe("2026-03-02 Ana Pérez Extra 2 #7");
    expect(nombrePestana({ id: 7, fecha: null, cliente: "x".repeat(200), tipo: "original", numero: 0 })).toHaveLength(100);
  });
});

describe("posiciones de la plantilla", () => {
  it("se detectan aunque la plantilla tenga filas de más arriba", () => {
    expect(detectarPosiciones(plantillaComo())).toEqual({ lugar: 8, cliente: 10, placa: 12, primera: 16, ultima: 51, nota: 54, firma: 55 });
    expect(detectarPosiciones(plantillaComo({ desplazar: 3 }))).toEqual({ lugar: 11, cliente: 13, placa: 15, primera: 19, ultima: 54, nota: 57, firma: 58 });
    // Sin nada reconocible: los valores del Excel.
    expect(detectarPosiciones([]).primera).toBe(16);
  });
});

describe("respaldarPresupuesto (Google simulado)", () => {
  let db: Db;
  let env: Env;
  let id: number;
  let llamadas: { url: string; cuerpo: any }[];
  let fallarDuplicado = false;

  const google: typeof fetch = async (entrada, init) => {
    const url = String(entrada);
    const cuerpo = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init?.body ? JSON.parse(String(init.body)) : null;
    llamadas.push({ url, cuerpo });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "tk", expires_in: 3600 });
    if (url.includes("/values/") && !init?.method) return json({ values: plantillaValores });
    if (url.includes("?fields=sheets")) return json({ sheets: [{ properties: { sheetId: 0, title: "FORMATO" } }, { properties: { sheetId: 5, title: "Otra" } }] });
    if (cuerpo?.requests?.[0]?.duplicateSheet) return fallarDuplicado ? json({ error: { message: "Sin permiso" } }, 403) : json({ replies: [{ duplicateSheet: { properties: { sheetId: 777 } } }] });
    return json({});
  };

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema: s }) as unknown as Db;
    await migrate(db as any, { migrationsFolder: "./drizzle" });
    await db.insert(s.usuarios).values({ email: "admin@ejemplo.com", nombre: "Admin", rol: "admin", estado: "activo" });
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    env = {
      DEV_AUTH_EMAIL: "admin@ejemplo.com",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "respaldo@ejemplo.iam.gserviceaccount.com",
      // Como queda en .dev.vars: con \\n escritos.
      GOOGLE_PRIVATE_KEY: (await exportPKCS8(privateKey)).replace(/\n/g, "\\n"),
      SHEETS_RESPALDO_ID: "archivo123",
    } as unknown as Env;
    const app = crearApp(() => db);
    const pedir = async (m: string, r: string, b?: unknown) =>
      (await app.request(`/api${r}`, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }, { DEV_AUTH_EMAIL: "admin@ejemplo.com" } as unknown as Env)).json() as Promise<any>;
    const cliente = await pedir("POST", "/clientes", { nombre: "Cliente Inventado" });
    const lineas = Array.from({ length: 40 }, (_, i) => ({ seccion: "ADENTRO", descripcion: `Trabajo ${i + 1}`, cantidad: 1, precioUnitario: 100, precioPendiente: false, productoId: null, detalles: [] }));
    const p = await pedir("POST", "/presupuestos", { clienteId: cliente.id, titulo: null, fecha: "2026-03-02", lugar: "Pueblo", cerradoEn: null, anticipo: null, notas: null, notaPie: null, lineas });
    id = p.id;
    await pedir("PATCH", `/presupuestos/${id}/estado`, { estado: "cotizacion" });
  });

  beforeEach(() => {
    llamadas = [];
    fallarDuplicado = false;
    olvidarCacheGoogle();
  });

  it("queda pendiente hasta respaldarse", async () => {
    expect((await contarPendientes(db))[0].n).toBe(1);
  });

  it("duplica FORMATO, agrega filas si no caben y guarda el link", async () => {
    const url = await respaldarPresupuesto(db, env, id, google);
    expect(url).toBe("https://docs.google.com/spreadsheets/d/archivo123/edit#gid=777");
    expect(llamadas[0].cuerpo.grant_type).toContain("jwt-bearer");
    const dup = llamadas.find((l) => l.cuerpo?.requests?.[0]?.duplicateSheet)!.cuerpo.requests[0].duplicateSheet;
    expect(dup).toMatchObject({ sourceSheetId: 0, newSheetName: `2026-03-02 Cliente Inventado #${id}` });
    // 1 título + 40 líneas + TOTAL = 42 filas; caben 36 → se insertan 6.
    const formato = llamadas.find((l) => l.cuerpo?.requests?.some((r: any) => r.insertDimension))!.cuerpo.requests;
    expect(formato[0].insertDimension.range).toMatchObject({ sheetId: 777, startIndex: 50, endIndex: 56 });
    const valores = llamadas.find((l) => l.url.endsWith("/values:batchUpdate"))!.cuerpo;
    expect(valores.valueInputOption).toBe("USER_ENTERED");
    const area = valores.data.find((d: any) => d.range.endsWith("!A16:D57"));
    expect(area.values).toHaveLength(42);
    expect(area.values[41][3]).toBe('=SUMIF(A17:A56,"-",D17:D56)');
    expect(valores.data.map((d: any) => d.range.split("!")[1])).toEqual(["A8", "A10", "A12", "A16:D57", "A60"]);

    const [p] = await db.select().from(s.presupuestos).where(eq(s.presupuestos.id, id));
    expect(p.sheetUrl).toBe(url);
    expect(p.respaldoError).toBeNull();
    expect((await contarPendientes(db))[0].n).toBe(0);
  });

  it("al respaldar otra vez borra la pestaña anterior", async () => {
    await respaldarPresupuesto(db, env, id, google);
    expect(llamadas.some((l) => l.cuerpo?.requests?.[0]?.deleteSheet?.sheetId === 777)).toBe(true);
  });

  it("si Google falla, anota el error y el presupuesto sigue igual", async () => {
    fallarDuplicado = true;
    await expect(respaldarPresupuesto(db, env, id, google)).rejects.toThrow(/Sin permiso/);
    const [p] = await db.select().from(s.presupuestos).where(eq(s.presupuestos.id, id));
    expect(p.respaldoError).toMatch(/Sin permiso/);
    expect(p.estado).toBe("cotizacion");
    expect((await contarPendientes(db))[0].n).toBe(1);
  });
});
