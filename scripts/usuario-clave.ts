/**
 * Crea (ya autorizado) o actualiza un usuario que entra con correo y contraseña.
 * Si ya existe, le pone la contraseña nueva, lo autoriza y cierra sus sesiones abiertas.
 *
 *   npm run usuarios:clave              → la base de .env (desarrollo)
 *   npm run usuarios:clave:produccion   → pide la URL de la rama production
 *
 * Lo mismo se puede hacer en la app: Usuarios → "+ Usuario con contraseña" / "Cambiar contraseña".
 * La contraseña no se guarda en ningún lado: solo su hash.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { hashClave, normalizarUsuario, problemaClave } from "../src/shared/clave";
import { urlParaScripts } from "./db-url";
import { pedirUrlProduccion } from "./url-produccion";

const produccion = process.argv.includes("--produccion");
const url = urlParaScripts(produccion ? await pedirUrlProduccion() : process.env.DATABASE_URL);
if (!url) {
  console.error("✗ Falta DATABASE_URL en .env");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin });
const lineas = rl[Symbol.asyncIterator]();
async function preguntar(texto: string) {
  process.stdout.write(texto);
  const r = await lineas.next();
  return r.done ? "" : String(r.value).trim();
}

console.log(`\nUsuario con contraseña en la base de ${produccion ? "PRODUCCIÓN" : "desarrollo (.env)"}.\n`);
const email = normalizarUsuario(await preguntar("Correo o usuario: "));
const nombre = await preguntar("Nombre (como sale en la app): ");
const clave = await preguntar("Contraseña: ");
rl.close();

const problema = !email || /\s/.test(email) ? "Correo o usuario inválido" : !nombre ? "Falta el nombre" : problemaClave(clave);
if (problema) {
  console.error(`✗ ${problema}`);
  process.exit(1);
}

const cliente = postgres(url, { max: 1 });
try {
  const db = drizzle(cliente, { schema });
  const claveHash = await hashClave(clave);
  const [ya] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, email));
  if (ya) {
    await db
      .update(schema.usuarios)
      .set({ nombre, estado: "activo", claveHash, claveVersion: sql`${schema.usuarios.claveVersion} + 1`, intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(schema.usuarios.id, ya.id));
    console.log(`\n✓ ${email}: contraseña cambiada y autorizado.`);
  } else {
    await db.insert(schema.usuarios).values({ email, nombre, estado: "activo", claveHash });
    console.log(`\n✓ ${email} creado, ya autorizado. Entra en /entrar con su correo y contraseña.`);
  }
} finally {
  await cliente.end();
}
