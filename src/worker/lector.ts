/**
 * Lector de fotos: manda las fotos de un presupuesto escrito a mano a la IA escogida en Ajustes
 * y devuelve el texto que contesta. El Worker solo reenvía (no achica ni procesa las fotos: eso
 * lo hace el navegador), así no gasta CPU.
 */
import { PROVEEDORES_LECTOR, type ProveedorLector } from "../shared/lector";
import type { Env } from "./env";

export interface Foto {
  /** "image/jpeg" | "image/png" | "image/webp" */
  tipo: string;
  /** base64 sin el "data:…;base64," */
  datos: string;
}

/** Error con un mensaje que se le puede mostrar a quien usa la app. */
export class ErrorLector extends Error {
  constructor(
    mensaje: string,
    readonly status: 400 | 429 | 502 | 503 = 502,
  ) {
    super(mensaje);
  }
}

export function proveedorDisponible(env: Env, p: ProveedorLector): boolean {
  return p === "claude" ? !!env.ANTHROPIC_API_KEY : !!env.AI;
}

/** Devuelve el texto de la respuesta de la IA (debería ser el JSON del presupuesto). */
export async function leerFotos(env: Env, proveedor: ProveedorLector, fotos: Foto[], prompt: string, pedir: typeof fetch = fetch): Promise<string> {
  if (!proveedorDisponible(env, proveedor))
    throw new ErrorLector(proveedor === "claude" ? "Claude no está configurado (falta la llave ANTHROPIC_API_KEY)" : "Cloudflare Workers AI no está configurado (falta el binding AI)", 503);
  return proveedor === "claude" ? leerConClaude(env.ANTHROPIC_API_KEY!, fotos, prompt, pedir) : leerConCloudflare(env.AI!, proveedor, fotos, prompt);
}

/* ───────────────────────── Cloudflare Workers AI ───────────────────────── */

async function leerConCloudflare(ai: Ai, proveedor: Exclude<ProveedorLector, "claude">, fotos: Foto[], prompt: string): Promise<string> {
  const { modelo } = PROVEEDORES_LECTOR[proveedor];
  const entrada = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...fotos.map((f) => ({ type: "image_url", image_url: { url: `data:${f.tipo};base64,${f.datos}` } })),
        ],
      },
    ],
    max_tokens: 8000,
    temperature: 0,
    // Gemma piensa antes de contestar si no se le dice: gasta más y no ayuda a leer letra.
    ...(proveedor === "cloudflare-gemma" ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  };
  let r: unknown;
  try {
    r = await (ai.run as (m: string, e: object) => Promise<unknown>)(modelo, entrada);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("Workers AI:", msg);
    if (/4006|daily free allocation|neurons/i.test(msg))
      throw new ErrorLector("Ya se usó todo lo gratis de Cloudflare por hoy. Se renueva a las 6 de la tarde (hora de Guatemala).", 429);
    if (/too large|payload|context|token/i.test(msg)) throw new ErrorLector("Las fotos son demasiado para este lector. Prueba con menos fotos.", 400);
    throw new ErrorLector(`Cloudflare no pudo leer las fotos: ${msg.slice(0, 200)}`);
  }
  return textoDeCloudflare(r);
}

/** Los modelos de Workers AI contestan en formas distintas: `{response}` o estilo OpenAI `{choices}`. */
export function textoDeCloudflare(r: unknown): string {
  const o = (r ?? {}) as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  const v = o.response ?? o.choices?.[0]?.message?.content;
  if (typeof v === "string" && v.trim()) return v;
  if (v && typeof v === "object") return JSON.stringify(v);
  throw new ErrorLector("Cloudflare contestó vacío. Intenta otra vez o con fotos más claras.");
}

/* ───────────────────────── Claude (API de Anthropic) ───────────────────────── */

async function leerConClaude(llave: string, fotos: Foto[], prompt: string, pedir: typeof fetch): Promise<string> {
  const res = await pedir("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": llave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: PROVEEDORES_LECTOR.claude.modelo,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            ...fotos.map((f) => ({ type: "image", source: { type: "base64", media_type: f.tipo, data: f.datos } })),
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
    error?: { type?: string; message?: string };
  };
  if (!res.ok) {
    const msg = j.error?.message ?? `HTTP ${res.status}`;
    console.error("Claude:", res.status, msg);
    if (res.status === 401) throw new ErrorLector("La llave de Claude no es válida (revisa ANTHROPIC_API_KEY).", 503);
    if (/credit balance|billing/i.test(msg)) throw new ErrorLector("La cuenta de Claude no tiene saldo. Hay que recargar créditos en console.anthropic.com.", 503);
    if (res.status === 429 || res.status === 529 || res.status >= 500) throw new ErrorLector("Claude está ocupado en este momento. Intenta en un rato.", 503);
    throw new ErrorLector(`Claude no pudo leer las fotos: ${msg.slice(0, 200)}`);
  }
  const texto = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  if (!texto.trim()) throw new ErrorLector("Claude contestó vacío. Intenta otra vez.");
  return texto;
}
