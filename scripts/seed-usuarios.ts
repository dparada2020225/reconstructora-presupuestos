/**
 * Crea/actualiza los usuarios de la app desde SEED_USUARIOS en .env
 * (formato: "correo:rol:Nombre;correo:rol:Nombre"). Los correos no viven en el repo.
 * Uso: npm run db:seed-usuarios
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

const ROLES = ["admin", "editor", "revisor"] as const;
type Rol = (typeof ROLES)[number];

const url = process.env.DATABASE_URL;
const crudo = process.env.SEED_USUARIOS ?? "";
if (!url || !crudo) {
  console.error("Faltan DATABASE_URL o SEED_USUARIOS en .env");
  process.exit(1);
}

const usuarios = crudo
  .split(";")
  .map((x) => x.trim())
  .filter(Boolean)
  .map((x) => {
    const [email, rol, ...nombre] = x.split(":");
    if (!ROLES.includes(rol as Rol)) throw new Error(`Rol inválido "${rol}" para ${email}`);
    return { email: email.trim().toLowerCase(), rol: rol as Rol, nombre: nombre.join(":").trim() || email };
  });

const cliente = postgres(url, { max: 1 });
try {
  const db = drizzle(cliente, { schema });
  for (const u of usuarios) {
    await db
      .insert(schema.usuarios)
      .values(u)
      .onConflictDoUpdate({ target: schema.usuarios.email, set: { rol: u.rol, nombre: u.nombre, activo: true } });
  }
  console.log(`✓ ${usuarios.length} usuarios listos`);
} finally {
  await cliente.end();
}
