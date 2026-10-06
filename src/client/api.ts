/** Cliente mínimo para la API del Worker. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (cuerpo as { error?: string }).error ?? res.statusText);
  return cuerpo as T;
}

export type Usuario = { id: number; email: string; nombre: string; rol: "admin" | "editor" | "revisor" };
