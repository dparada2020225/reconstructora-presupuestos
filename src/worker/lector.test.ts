import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";
import { LIMITE_DIARIO } from "../shared/lector";
import { crearApp } from "./app";
import type { Env } from "./env";
import { textoDeCloudflare } from "./lector";

/** Datos inventados. Una "foto" de 1×1. */
const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const RESPUESTA = {
  cliente: "Cliente Inventado",
  fecha: "2026-03-02",
  secciones: [{ titulo: "ADENTRO", totalEscrito: 1500, lineas: [{ descripcion: "Pintar techo", precio: 1500, cadaUno: false, cantidad: 1, detalles: [] }] }],
  dudas: [],
};

describe("API del lector de fotos", () => {
  let db: Db;
  let app: ReturnType<typeof crearApp>;
  const pedidos: { modelo: string; entrada: any }[] = [];
  const ai = {
    run: async (modelo: string, entrada: any) => {
      pedidos.push({ modelo, entrada });
      return { response: "```json\n" + JSON.stringify(RESPUESTA) + "\n```" };
    },
  };
  const env = (extra: Partial<Env> = {}, email = "admin@ejemplo.com") => ({ DEV_AUTH_EMAIL: email, AI: ai, ...extra }) as unknown as Env;
  const pedir = async (m: string, r: string, b?: unknown, e = env()) => {
    const res = await app.request(`/api${r}`, { method: m, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }, e);
    return { status: res.status, json: (await res.json()) as any };
  };

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema: s }) as unknown as Db;
    await migrate(db as any, { migrationsFolder: "./drizzle" });
    await db.insert(s.usuarios).values([
      { email: "admin@ejemplo.com", nombre: "Admin", rol: "admin", estado: "activo" },
      { email: "usuario@ejemplo.com", nombre: "Usuario", rol: "usuario", estado: "activo" },
    ]);
    app = crearApp(() => db);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("por defecto usa Cloudflare; Claude no está disponible sin llave", async () => {
    const { json } = await pedir("GET", "/lector");
    expect(json.proveedor).toBe("cloudflare-gemma");
    expect(json.proveedores.find((p: any) => p.id === "claude").disponible).toBe(false);
    expect(json.proveedores.find((p: any) => p.id === "cloudflare-gemma").disponible).toBe(true);
  });

  it("lee las fotos con Workers AI y devuelve el presupuesto limpio", async () => {
    const { status, json } = await pedir("POST", "/lector", { fotos: [FOTO, FOTO], vocabulario: ["Forrar techo"] });
    expect(status).toBe(200);
    expect(json.lectura.cliente).toBe("Cliente Inventado");
    expect(json.lectura.secciones[0].lineas[0]).toMatchObject({ descripcion: "Pintar techo", precio: 1500 });
    expect(json.usoHoy).toBe(1);
    const { modelo, entrada } = pedidos.at(-1)!;
    expect(modelo).toBe("@cf/google/gemma-4-26b-a4b-it");
    const partes = entrada.messages[0].content;
    expect(partes.filter((p: any) => p.type === "image_url").map((p: any) => p.image_url.url)).toEqual([FOTO, FOTO]);
    expect(partes[0].text).toContain("Forrar techo");
  });

  it("valida las fotos", async () => {
    expect((await pedir("POST", "/lector", { fotos: [] })).status).toBe(400);
    expect((await pedir("POST", "/lector", { fotos: ["data:text/plain;base64,aG9sYQ=="] })).json.error).toMatch(/JPG/);
    expect((await pedir("POST", "/lector", { fotos: Array(7).fill(FOTO) })).json.error).toMatch(/Máximo 6/);
  });

  it("solo el admin cambia el lector; Claude con su llave", async () => {
    expect((await pedir("PUT", "/lector", { proveedor: "claude" }, env({}, "usuario@ejemplo.com"))).status).toBe(403);
    expect((await pedir("PUT", "/lector", { proveedor: "otro" })).status).toBe(400);
    expect((await pedir("PUT", "/lector", { proveedor: "claude" })).json.proveedor).toBe("claude");
    // Sin llave no se puede leer con Claude.
    expect((await pedir("POST", "/lector", { fotos: [FOTO] })).status).toBe(503);

    const llamadas: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      llamadas.push({ url, headers: init.headers, cuerpo: JSON.parse(String(init.body)) });
      return Response.json({ content: [{ type: "text", text: JSON.stringify(RESPUESTA) }], stop_reason: "end_turn" });
    });
    const { status, json } = await pedir("POST", "/lector", { fotos: [FOTO] }, env({ ANTHROPIC_API_KEY: "llave-inventada" }));
    expect(status).toBe(200);
    expect(json.proveedor).toBe("claude");
    expect(llamadas[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(llamadas[0].headers["x-api-key"]).toBe("llave-inventada");
    expect(llamadas[0].cuerpo.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/4AAQSkZJRg==" } });

    // Errores de Claude con mensajes que se entienden.
    vi.stubGlobal("fetch", async () => Response.json({ error: { message: "Your credit balance is too low" } }, { status: 400 }));
    expect((await pedir("POST", "/lector", { fotos: [FOTO] }, env({ ANTHROPIC_API_KEY: "x" }))).json.error).toMatch(/saldo/);

    // Se puede probar otro lector sin cambiar el de Ajustes.
    expect((await pedir("POST", "/lector", { fotos: [FOTO], proveedor: "cloudflare-llama" })).json.proveedor).toBe("cloudflare-llama");
    expect(pedidos.at(-1)!.modelo).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    await pedir("PUT", "/lector", { proveedor: "cloudflare-gemma" });
  });

  it("respuesta sin JSON y límite de Cloudflare", async () => {
    const malo = { run: async () => ({ response: "No veo ningún presupuesto" }) };
    expect((await pedir("POST", "/lector", { fotos: [FOTO] }, env({ AI: malo as any }))).json.error).toMatch(/no hay JSON/);
    const agotado = {
      run: async () => {
        throw new Error("4006: you have used up your daily free allocation of 10,000 neurons");
      },
    };
    const r = await pedir("POST", "/lector", { fotos: [FOTO] }, env({ AI: agotado as any }));
    expect(r.status).toBe(429);
    expect(r.json.error).toMatch(/6 de la tarde/);
  });

  it("límite diario", async () => {
    const { usoHoy } = (await pedir("GET", "/lector")).json;
    expect(usoHoy).toBeGreaterThan(0);
    const uso = (await db.select().from(s.configuracion).where(eq(s.configuracion.clave, "lector_uso")))[0];
    await db.update(s.configuracion).set({ valor: JSON.stringify({ ...JSON.parse(uso.valor), n: LIMITE_DIARIO }) }).where(eq(s.configuracion.clave, "lector_uso"));
    const r = await pedir("POST", "/lector", { fotos: [FOTO] });
    expect(r.status).toBe(429);
    expect(r.json.error).toMatch(/límite diario/);
  });

  it("opciones de Nuevo presupuesto: el admin las prende y apaga, siempre queda una", async () => {
    expect((await pedir("GET", "/lector")).json.modos).toEqual({ mano: true, fotos: true, pegar: true });
    expect((await pedir("PUT", "/lector", { modos: { pegar: false } }, env({}, "usuario@ejemplo.com"))).status).toBe(403);
    expect((await pedir("PUT", "/lector", { modos: { fotos: false, pegar: false } })).json.modos).toEqual({ mano: true, fotos: false, pegar: false });
    expect((await pedir("PUT", "/lector", { modos: { mano: false } })).json.error).toMatch(/al menos una/);
    // Con "Desde fotos" apagado no se puede leer.
    expect((await pedir("POST", "/lector", { fotos: [FOTO] })).status).toBe(403);
    await pedir("PUT", "/lector", { modos: { fotos: true, pegar: true } });
  });

  it("formas de respuesta de Workers AI", () => {
    expect(textoDeCloudflare({ response: "hola" })).toBe("hola");
    expect(textoDeCloudflare({ response: { a: 1 } })).toBe('{"a":1}');
    expect(textoDeCloudflare({ choices: [{ message: { content: "hola" } }] })).toBe("hola");
    expect(() => textoDeCloudflare({})).toThrow(/vacío/);
  });
});
