import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import type { Db } from "../db/tipos";
import { hashClave, verificarClave } from "../shared/clave";
import { crearApp } from "./app";
import type { Env } from "./env";
import { MAX_INTENTOS } from "./routes/sesion";

/** Datos inventados. */
const SECRETO = "secreto-de-prueba-que-tiene-mas-de-32-caracteres";
const admin = { DEV_AUTH_EMAIL: "admin@ejemplo.com", SESSION_SECRET: SECRETO } as unknown as Env;
const publico = { SESSION_SECRET: SECRETO } as unknown as Env;

describe("contraseñas", () => {
  it("hash con sal: verifica la correcta y rechaza lo demás", async () => {
    const h = await hashClave("clave-inventada");
    expect(h).toMatch(/^pbkdf2-sha256\$30000\$/);
    expect(h).not.toBe(await hashClave("clave-inventada"));
    expect(await verificarClave("clave-inventada", h)).toBe(true);
    expect(await verificarClave("clave-inventadA", h)).toBe(false);
    expect(await verificarClave("x", "basura")).toBe(false);
    expect(await verificarClave("x", "pbkdf2-sha256$0$aa$bb")).toBe(false);
  });
});

describe("entrar con correo y contraseña", { timeout: 30_000 }, () => {
  let db: Db;
  let app: ReturnType<typeof crearApp>;
  const pedir = (m: string, r: string, env: Env, b?: unknown, cookie?: string) =>
    app.request(
      r,
      { method: m, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) },
      env,
    );
  const cookieDe = (r: Response) => r.headers.get("set-cookie")?.split(";")[0] ?? "";
  const entrar = (email: string, clave: string) => pedir("POST", "/api/sesion", publico, { email, clave });
  let idPapa = 0;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema: s }) as unknown as Db;
    await migrate(db as never, { migrationsFolder: "./drizzle" });
    await db.insert(s.usuarios).values({ email: "admin@ejemplo.com", nombre: "Admin", rol: "admin", estado: "activo" });
    app = crearApp(() => db);
  });

  it("el admin crea usuarios ya autorizados con contraseña", async () => {
    expect((await pedir("POST", "/api/usuarios", admin, { email: "papa@ejemplo.com", nombre: "Papá", clave: "1234" })).status).toBe(400);
    const r = await pedir("POST", "/api/usuarios", admin, { email: " Papa@Ejemplo.com ", nombre: "Papá", clave: "12345678" });
    expect(r.status).toBe(201);
    idPapa = ((await r.json()) as { id: number }).id;
    expect((await pedir("POST", "/api/usuarios", admin, { email: "papa@ejemplo.com", nombre: "Otro", clave: "12345678" })).status).toBe(409);

    const lista = (await (await pedir("GET", "/api/usuarios", admin)).json()) as Record<string, unknown>[];
    const papa = lista.find((u) => u.id === idPapa)!;
    expect(papa).toMatchObject({ email: "papa@ejemplo.com", estado: "activo", conClave: true, bloqueadoHasta: null });
    // Nunca sale el hash.
    expect(JSON.stringify(lista)).not.toContain("pbkdf2");
  });

  it("sin sesión no entra; con la contraseña correcta sí, y Salir la cierra", async () => {
    expect((await pedir("GET", "/api/me", publico)).status).toBe(401);
    expect((await entrar("papa@ejemplo.com", "malamala")).status).toBe(401);
    expect((await entrar("nadie@ejemplo.com", "12345678")).status).toBe(401);

    const r = await entrar("PAPA@ejemplo.com", "12345678");
    expect(r.status).toBe(200);
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    const cookie = cookieDe(r);
    const me = await pedir("GET", "/api/me", publico, undefined, cookie);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: "papa@ejemplo.com", rol: "usuario" });
    // Un usuario normal no entra a lo de admin.
    expect((await pedir("GET", "/api/usuarios", publico, undefined, cookie)).status).toBe(403);

    const salir = await pedir("DELETE", "/api/sesion", publico, undefined, cookie);
    expect(salir.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    // Una cookie inventada o firmada con otro secreto no sirve.
    expect((await pedir("GET", "/api/me", publico, undefined, "sesion=abc.def.ghi")).status).toBe(401);
  });

  it(`bloquea después de ${MAX_INTENTOS} intentos; cambiar la contraseña desbloquea y cierra sesiones`, async () => {
    const vieja = cookieDe(await entrar("papa@ejemplo.com", "12345678"));
    for (let i = 0; i < MAX_INTENTOS; i++) expect((await entrar("papa@ejemplo.com", "equivocada")).status).toBe(401);
    const bloqueado = await entrar("papa@ejemplo.com", "12345678");
    expect(bloqueado.status).toBe(429);
    expect(((await bloqueado.json()) as { error: string }).error).toMatch(/Espera 15 minutos/);

    expect((await pedir("PUT", `/api/usuarios/${idPapa}/clave`, admin, { clave: "nueva-clave-1" })).status).toBe(200);
    expect((await pedir("GET", "/api/me", publico, undefined, vieja)).status).toBe(401);
    expect((await entrar("papa@ejemplo.com", "12345678")).status).toBe(401);
    expect((await entrar("papa@ejemplo.com", "nueva-clave-1")).status).toBe(200);
  });

  it("si le quitan el acceso o la contraseña, ya no entra", async () => {
    const cookie = cookieDe(await entrar("papa@ejemplo.com", "nueva-clave-1"));
    await pedir("PATCH", `/api/usuarios/${idPapa}`, admin, { estado: "denegado" });
    expect((await pedir("GET", "/api/me", publico, undefined, cookie)).status).toBe(403);
    expect((await entrar("papa@ejemplo.com", "nueva-clave-1")).status).toBe(403);
    await pedir("PATCH", `/api/usuarios/${idPapa}`, admin, { estado: "activo" });

    expect((await pedir("DELETE", `/api/usuarios/${idPapa}/clave`, admin)).status).toBe(200);
    expect((await entrar("papa@ejemplo.com", "nueva-clave-1")).status).toBe(401);
    const [u] = await db.select().from(s.usuarios).where(eq(s.usuarios.id, idPapa));
    expect(u.claveHash).toBeNull();
  });

  it("/acceso: sin el JWT de Access manda a /entrar; en local entra directo", async () => {
    const r = await pedir("GET", "/acceso", publico);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/entrar?error=acceso");
    expect((await pedir("GET", "/acceso", admin)).headers.get("location")).toBe("/");
    // El resto de la API sigue respondiendo JSON con su manejo de errores.
    expect(await (await pedir("GET", "/api/no-existe", admin)).json()).toEqual({ error: "No encontrado" });
  });
});
