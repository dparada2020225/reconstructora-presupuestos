import { createInterface } from "node:readline/promises";

const host = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};

/**
 * Pide en la terminal la URL de la rama *production* de Neon (no queda guardada en ningún archivo).
 * Si no parece una URL de Postgres, o es la misma base de .env (desarrollo), termina sin hacer nada.
 */
export async function pedirUrlProduccion(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nPega la URL de conexión de la rama *production* de Neon");
  console.log("(Neon → Connect → rama production → Connection pooling apagado → Copy snippet)\n");
  const url = (await rl.question("URL: ")).trim().replace(/^["']|["']$/g, "");
  rl.close();
  if (!/^postgres(ql)?:\/\/.+@.+\/.+/.test(url)) {
    console.error("✗ Eso no parece una URL de Postgres. No se cambió nada.");
    process.exit(1);
  }
  if (host(url) === host(process.env.DATABASE_URL)) {
    console.error("✗ Esa es la misma base que tienes en .env (la de desarrollo). Copia la de la rama production.");
    process.exit(1);
  }
  return url;
}
