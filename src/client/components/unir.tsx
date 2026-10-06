import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { clavePar, posiblesDuplicados } from "../../shared/claves";
import { api, enviar, type Descartado } from "../api";
import { Aviso, Boton, ComboBusqueda, Confirmar, Dialogo, type Opcion } from "./ui";

type Tipo = "clientes" | "buses" | "productos";

/** Qué pasa al unir, en palabras de cada tipo. */
const EXPLICACION: Record<Tipo, (queda: string, se: string) => ReactNode> = {
  clientes: (q, s) => (
    <>
      Los trabajos, buses y formas de escribir de <b>{s}</b> pasan a <b>{q}</b>, y <b>{s}</b> se borra.
    </>
  ),
  buses: (q, s) => (
    <>
      Los trabajos de <b>{s}</b> pasan a <b>{q}</b> (y su placa, si a {q} le falta), y <b>{s}</b> se borra.
    </>
  ),
  productos: (q, s) => (
    <>
      Todas las veces que se cotizó <b>{s}</b> cuentan desde ahora como <b>{q}</b> (en estadísticas e historial de precios), y{" "}
      <b>{s}</b> se borra del catálogo.
    </>
  ),
};

function useUnir(tipo: Tipo, alTerminar?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quedaId, otroId }: { quedaId: number; otroId: number }) => enviar("POST", `/${tipo}/${quedaId}/unir`, { otroId }),
    onSuccess: () => {
      // Unir mueve trabajos entre clientes, buses y productos: se refresca todo.
      qc.invalidateQueries();
      alTerminar?.();
    },
  });
}

/** Botón + diálogo "Unir con otro…" en la página de detalle: el otro se une DENTRO de este. */
export function UnirCon({ tipo, este, opciones, sustantivo }: { tipo: Tipo; este: { id: number; nombre: string }; opciones: Opcion[]; sustantivo: string }) {
  const [abierto, setAbierto] = useState(false);
  const [otroId, setOtroId] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const cerrar = () => (setAbierto(false), setConfirmar(false), setOtroId(null));
  const unir = useUnir(tipo, cerrar);
  const otro = opciones.find((o) => o.id === otroId);

  return (
    <>
      <Boton onClick={() => (unir.reset(), setAbierto(true))}>Unir con otro {sustantivo}…</Boton>
      <Dialogo abierto={abierto && !confirmar} onCerrar={cerrar} titulo={`Unir otro ${sustantivo} con ${este.nombre}`}>
        <p className="mb-3 text-sm text-slate-600">
          Úsalo cuando el mismo {sustantivo} quedó registrado dos veces. Escoge el repetido: todo lo suyo pasa a <b>{este.nombre}</b>.
        </p>
        <ComboBusqueda
          opciones={opciones.filter((o) => o.id !== este.id)}
          valor={otroId}
          onChange={setOtroId}
          permitirVacio={false}
          placeholder={`Buscar ${sustantivo}…`}
          autoFocus
        />
        <div className="mt-5 flex justify-end gap-2">
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={!otroId} onClick={() => setConfirmar(true)}>
            Continuar
          </Boton>
        </div>
      </Dialogo>
      <Confirmar
        abierto={confirmar && !!otro}
        titulo="¿Unir?"
        textoBoton="Sí, unir"
        ocupado={unir.isPending}
        error={unir.error?.message}
        onCerrar={cerrar}
        onConfirmar={() => otro && unir.mutate({ quedaId: este.id, otroId: otro.id })}
      >
        <p>{EXPLICACION[tipo](este.nombre, otro?.etiqueta ?? "")}</p>
        <p className="font-medium">No se puede deshacer.</p>
      </Confirmar>
    </>
  );
}

/**
 * Lista de posibles repetidos (se calcula en el navegador) con botones para unir
 * o marcar "no son el mismo" (eso se guarda y ya no vuelve a salir).
 */
export function PanelDuplicados<T extends { id: number }>({
  tipo,
  items,
  clave,
  nombre,
  detalle,
  peso,
}: {
  tipo: "clientes" | "productos";
  items: T[];
  clave: (t: T) => string;
  nombre: (t: T) => string;
  detalle: (t: T) => string;
  /** Para sugerir cuál dejar: el que más se ha usado. */
  peso: (t: T) => number;
}) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [cuantos, setCuantos] = useState(10);
  const [unirPar, setUnirPar] = useState<{ queda: T; otro: T } | null>(null);
  const descartados = useQuery({
    queryKey: ["descartados", tipo],
    queryFn: () => api<Descartado[]>(`/${tipo}/duplicados/descartados`),
  });
  const descartar = useMutation({
    mutationFn: (p: { aId: number; bId: number }) => enviar("POST", `/${tipo}/duplicados/descartados`, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["descartados", tipo] }),
  });
  const unir = useUnir(tipo, () => setUnirPar(null));

  const diferidos = useDeferredValue(items);
  const pares = useMemo(() => {
    if (!descartados.data) return [];
    const set = new Set(descartados.data.map((d) => clavePar(d.aId, d.bId)));
    return posiblesDuplicados(diferidos, clave, set);
  }, [diferidos, descartados.data, clave]);

  if (!pares.length) return null;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm"
      >
        <span>
          <b>{pares.length}</b> {pares.length === 1 ? "posible repetido" : "posibles repetidos"} — nombres que se parecen mucho
        </span>
        <span className="text-marca-700">{abierto ? "Ocultar" : "Revisar"}</span>
      </button>
      {abierto && (
        <div className="space-y-2 border-t border-amber-200 p-3">
          {descartar.error && <Aviso>{descartar.error.message}</Aviso>}
          {pares.slice(0, cuantos).map(({ a, b, motivo }) => {
            const [primero, segundo] = peso(a) >= peso(b) ? [a, b] : [b, a];
            return (
              <div key={clavePar(a.id, b.id)} className="rounded-md border border-slate-200 bg-white p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[primero, segundo].map((x) => (
                    <div key={x.id} className="min-w-0">
                      <p className="truncate font-medium" title={nombre(x)}>
                        {nombre(x)}
                      </p>
                      <p className="text-xs text-slate-500">{detalle(x)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs text-slate-500">{motivo}</span>
                  <Boton variante="texto" onClick={() => (unir.reset(), setUnirPar({ queda: primero, otro: segundo }))}>
                    Dejar “{recortar(nombre(primero))}”
                  </Boton>
                  <Boton variante="texto" onClick={() => (unir.reset(), setUnirPar({ queda: segundo, otro: primero }))}>
                    Dejar “{recortar(nombre(segundo))}”
                  </Boton>
                  <Boton disabled={descartar.isPending} onClick={() => descartar.mutate({ aId: a.id, bId: b.id })}>
                    No son el mismo
                  </Boton>
                </div>
              </div>
            );
          })}
          {pares.length > cuantos && (
            <Boton variante="texto" onClick={() => setCuantos((n) => n + 20)}>
              Ver más ({pares.length - cuantos})
            </Boton>
          )}
        </div>
      )}
      <Confirmar
        abierto={!!unirPar}
        titulo="¿Unir?"
        textoBoton="Sí, unir"
        ocupado={unir.isPending}
        error={unir.error?.message}
        onCerrar={() => setUnirPar(null)}
        onConfirmar={() => unirPar && unir.mutate({ quedaId: unirPar.queda.id, otroId: unirPar.otro.id })}
      >
        {unirPar && <p>{EXPLICACION[tipo](nombre(unirPar.queda), nombre(unirPar.otro))}</p>}
        <p className="font-medium">No se puede deshacer.</p>
      </Confirmar>
    </section>
  );
}

const recortar = (t: string) => (t.length > 28 ? `${t.slice(0, 26)}…` : t);
