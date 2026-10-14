/**
 * Contraseñas: PBKDF2-SHA256 con sal aleatoria, guardado como
 *   "pbkdf2-sha256$<iteraciones>$<sal base64url>$<hash base64url>".
 * Usa WebCrypto (igual en el Worker, en Node 22 y en las pruebas). Las contraseñas NUNCA se guardan
 * ni se pueden recuperar: solo se comparan. Si alguien la olvida, el admin le pone otra.
 *
 * 30 000 iteraciones ≈ 5 ms de CPU: cabe en los ~10 ms por petición del plan gratis de Workers.
 * Como el número va dentro del hash, se puede subir más adelante sin romper las existentes.
 */
const ITERACIONES = 30_000;
const PREFIJO = "pbkdf2-sha256";
export const CLAVE_MIN = 8;
export const CLAVE_MAX = 100;

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desdeB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function derivar(clave: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal as Uint8Array<ArrayBuffer>, iterations: iteraciones }, llave, 256);
  return new Uint8Array(bits);
}

export async function hashClave(clave: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `${PREFIJO}$${ITERACIONES}$${b64(sal)}$${b64(await derivar(clave, sal, ITERACIONES))}`;
}

/** Compara en tiempo constante. Un hash con formato raro simplemente no coincide. */
export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const [prefijo, it, sal, hash] = guardado.split("$");
  const iteraciones = Number(it);
  if (prefijo !== PREFIJO || !Number.isInteger(iteraciones) || iteraciones < 1 || !sal || !hash) return false;
  let esperado: Uint8Array;
  try {
    esperado = desdeB64(hash);
  } catch {
    return false;
  }
  const obtenido = await derivar(clave, desdeB64(sal), iteraciones);
  if (obtenido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < obtenido.length; i++) dif |= obtenido[i] ^ esperado[i];
  return dif === 0;
}

/** Problema con una contraseña nueva, o null si sirve. */
export function problemaClave(clave: string): string | null {
  if (clave.length < CLAVE_MIN) return `La contraseña debe tener al menos ${CLAVE_MIN} caracteres`;
  if (clave.length > CLAVE_MAX) return `Máximo ${CLAVE_MAX} caracteres`;
  return null;
}

/** Correo o usuario con el que se entra: sin espacios a los lados y en minúsculas. */
export const normalizarUsuario = (u: string) => u.trim().toLowerCase();
