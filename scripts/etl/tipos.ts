/** Tipos intermedios del ETL de presupuestos históricos. */

export interface ItemCrudo {
  seccion: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number | null;
  /** Total de la línea. */
  precio: number | null;
  precioPendiente: boolean;
  /** El item viene de una sección "EXTRAS" dentro del documento. */
  enSeccionExtra: boolean;
  /** Sub-items ("*", "a. b. c."): detalle del item, no suman al total. */
  hijos: ItemCrudo[];
  /** Fila de origen, para el reporte. */
  fila: number;
}

/** Un documento tal como aparece en Excel (una pestaña o un bloque de la hoja vieja). */
export interface DocCrudo {
  archivo: "nuevo" | "viejo";
  /** Pestaña ("JUAN PÉREZ EXTRAS") o "Hoja1 fila 1399". */
  ref: string;
  /** Nombre de la pestaña (solo archivo nuevo). */
  pestana: string | null;
  fechaTexto: string | null;
  fecha: string | null;
  lugar: string | null;
  clienteTexto: string | null;
  transporteTexto: string | null;
  items: ItemCrudo[];
  /** Montos de líneas TOTAL encontradas (para validar). El último suele ser el total final. */
  totalesEscritos: number[];
  cerradoEn: number | null;
  anticipo: number | null;
  /** Totales escritos sin precio por item (p. ej. lista de trabajos + un solo TOTAL). */
  totalSinDesglose: number;
  /** Cantidad de líneas TOTAL que solo resumen otras (para el reporte). */
  resumenes: number;
  /** El nombre de la pestaña/cliente dice EXTRA(S), ACCESORIOS, ARREGLO, etc. */
  marcadoComoExtra: boolean;
  avisos: string[];
}

export interface Overrides {
  /** alias normalizado → nombre canónico del cliente */
  clientes?: Record<string, string>;
  /** ref del documento → nombre del cliente correcto */
  clientePorDoc?: Record<string, string>;
  /** texto de transporte normalizado → nombre canónico del bus (o "" para "sin bus") */
  buses?: Record<string, string>;
  /** descripción normalizada → nombre canónico del producto */
  productos?: Record<string, string>;
  /** ref del documento → clave de trabajo explícita (docs con la misma clave = mismo trabajo) */
  trabajoPorDoc?: Record<string, string>;
  /** ref del documento → forzar tipo */
  tipoPorDoc?: Record<string, "original" | "extra">;
  /** refs que hay que ignorar (duplicados, plantillas, pruebas) */
  ignorar?: string[];
  /** claves de trabajo (o ref de su primer doc) que NO se concretaron */
  noConcretados?: string[];
}

export interface ItemFinal {
  orden: number;
  seccion: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number | null;
  precio: number | null;
  precioPendiente: boolean;
  producto: string | null;
  hijos: Omit<ItemFinal, "hijos">[];
}

export interface PresupuestoFinal {
  tipo: "original" | "extra";
  numero: number;
  titulo: string;
  fecha: string | null;
  lugar: string | null;
  total: number;
  /** Total escrito en el Excel (si había) para comparar. */
  totalEscrito: number | null;
  cerradoEn: number | null;
  anticipo: number | null;
  origenRefs: string[];
  items: ItemFinal[];
}

export interface TrabajoFinal {
  clave: string;
  cliente: string;
  bus: { placa: string | null; nombre: string | null } | null;
  estado: "terminado" | "no_concretado";
  fechaInicio: string | null;
  fechaFin: string | null;
  precioCerrado: number | null;
  presupuestos: PresupuestoFinal[];
}

export interface Historico {
  generado: string;
  clientes: { nombre: string; alias: string[] }[];
  buses: { cliente: string; placa: string | null; nombre: string | null }[];
  productos: { nombre: string; categoria: string | null; alias: string[]; veces: number }[];
  trabajos: TrabajoFinal[];
}
