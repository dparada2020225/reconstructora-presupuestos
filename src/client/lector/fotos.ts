import type { AvisoLectura, ProveedorLector } from "../../shared/lector";
import { LADO_FOTO } from "../../shared/lector";

/**
 * Achica una foto del celular (4000 px, varios MB) a JPG de LADO_FOTO px de lado largo: la IA no
 * aprovecha más y así sube rápido aunque la señal sea mala. Respeta la rotación de la foto.
 */
export async function achicarFoto(archivo: File, lado = LADO_FOTO): Promise<string> {
  let fuente: CanvasImageSource & { width: number; height: number };
  let cerrar = () => {};
  try {
    const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    fuente = bmp;
    cerrar = () => bmp.close();
  } catch {
    // Navegadores viejos: con <img>.
    const url = URL.createObjectURL(archivo);
    try {
      fuente = await new Promise<HTMLImageElement>((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => mal(new Error(`No se pudo abrir "${archivo.name}". ¿Es una foto?`));
        i.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  try {
    const escala = Math.min(1, lado / Math.max(fuente.width, fuente.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(fuente.width * escala);
    canvas.height = Math.round(fuente.height * escala);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // PNG con transparencia → fondo blanco
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    cerrar();
  }
}

export interface FotosLeidas {
  fotos: string[];
  avisos: AvisoLectura[];
  proveedor: ProveedorLector;
}

/**
 * Las fotos no se guardan en la base. Se quedan en la memoria de esta pestaña para seguir
 * viéndolas al lado del presupuesto después de guardarlo (hasta recargar la página).
 */
const enMemoria = new Map<number, FotosLeidas>();
export const recordarFotos = (id: number, f: FotosLeidas) => void enMemoria.set(id, f);
export const fotosDe = (id: number) => enMemoria.get(id) ?? null;
export const olvidarFotos = (id: number) => void enMemoria.delete(id);
