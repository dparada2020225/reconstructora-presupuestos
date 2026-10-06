import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ───────────────────────── Enums ───────────────────────── */

export const rolUsuario = pgEnum("rol_usuario", ["admin", "editor", "revisor"]);

/** Estado del trabajo completo (original + extras). */
export const estadoTrabajo = pgEnum("estado_trabajo", [
  "cotizado", // presupuesto entregado, aún no arranca
  "en_curso",
  "terminado",
  "no_concretado",
]);

/** Flujo de cada documento: lo arma el editor, lo revisa el revisor y se envía. */
export const estadoPresupuesto = pgEnum("estado_presupuesto", [
  "borrador",
  "en_revision",
  "aprobado",
  "enviado",
]);

export const tipoPresupuesto = pgEnum("tipo_presupuesto", ["original", "extra"]);

/** De dónde vino el registro: creado en la app o migrado de los Excel. */
export const origenRegistro = pgEnum("origen_registro", ["app", "historico"]);

const timestamps = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Dinero en quetzales con 2 decimales. Drizzle lo devuelve como string. */
const quetzales = (nombre: string) => numeric(nombre, { precision: 12, scale: 2 });

/* ───────────────────────── Usuarios ───────────────────────── */

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  nombre: text("nombre").notNull(),
  rol: rolUsuario("rol").notNull().default("editor"),
  activo: boolean("activo").notNull().default(true),
  ...timestamps,
});

/* ───────────────────────── Clientes y buses ───────────────────────── */

export const clientes = pgTable(
  "clientes",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    notas: text("notas"),
    origen: origenRegistro("origen").notNull().default("app"),
    ...timestamps,
  },
  (t) => [index("clientes_nombre_idx").on(t.nombre)],
);

/** Otras formas en que aparece escrito un cliente (para búsqueda y para el ETL). */
export const clienteAlias = pgTable("cliente_alias", {
  id: serial("id").primaryKey(),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "cascade" }),
  /** Normalizado: minúsculas, sin tildes ni signos. */
  alias: text("alias").notNull().unique(),
});

/**
 * Un bus (unidad). Casi ningún presupuesto histórico trae placa, así que un bus
 * se identifica por placa O por nombre ("La Estrella").
 */
export const buses = pgTable(
  "buses",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    placa: text("placa"),
    nombre: text("nombre"),
    descripcion: text("descripcion"),
    notas: text("notas"),
    origen: origenRegistro("origen").notNull().default("app"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("buses_placa_unq").on(t.placa).where(sql`${t.placa} is not null`),
    index("buses_cliente_idx").on(t.clienteId),
  ],
);

/* ───────────────────────── Catálogo ───────────────────────── */

export const productos = pgTable("productos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  /** ADENTRO, AFUERA, TROMPA, ACCESORIOS, AUDIO, LUCES, MECÁNICA, SILLAS, OTROS… */
  categoria: text("categoria"),
  precioReferencia: quetzales("precio_referencia"),
  unidad: text("unidad"),
  activo: boolean("activo").notNull().default(true),
  notas: text("notas"),
  ...timestamps,
});

export const productoAlias = pgTable("producto_alias", {
  id: serial("id").primaryKey(),
  productoId: integer("producto_id")
    .notNull()
    .references(() => productos.id, { onDelete: "cascade" }),
  alias: text("alias").notNull().unique(),
});

/* ───────────────────────── Trabajos y presupuestos ───────────────────────── */

/** Un trabajo agrupa el presupuesto original y todos sus extras. */
export const trabajos = pgTable(
  "trabajos",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    busId: integer("bus_id").references(() => buses.id, { onDelete: "set null" }),
    titulo: text("titulo"),
    estado: estadoTrabajo("estado").notNull().default("cotizado"),
    fechaInicio: date("fecha_inicio"),
    fechaFin: date("fecha_fin"),
    /** Precio final negociado de todo el trabajo, si lo hubo. */
    precioCerrado: quetzales("precio_cerrado"),
    notas: text("notas"),
    origen: origenRegistro("origen").notNull().default("app"),
    ...timestamps,
  },
  (t) => [index("trabajos_cliente_idx").on(t.clienteId), index("trabajos_bus_idx").on(t.busId)],
);

export const presupuestos = pgTable(
  "presupuestos",
  {
    id: serial("id").primaryKey(),
    trabajoId: integer("trabajo_id")
      .notNull()
      .references(() => trabajos.id, { onDelete: "cascade" }),
    tipo: tipoPresupuesto("tipo").notNull().default("original"),
    /** 0 = original; 1, 2, 3… = extras en orden. */
    numero: integer("numero").notNull().default(0),
    titulo: text("titulo"),
    fecha: date("fecha"),
    lugar: text("lugar").default("Ciudad Vieja Sacatepéquez"),
    estado: estadoPresupuesto("estado").notNull().default("borrador"),
    /** Suma de items (se recalcula al guardar). */
    total: quetzales("total"),
    /** "Cerrado en": precio negociado de este documento. */
    cerradoEn: quetzales("cerrado_en"),
    /** Anticipo registrado en el documento (los pagos formales llegan en otra fase). */
    anticipo: quetzales("anticipo"),
    notas: text("notas"),
    notaPie: text("nota_pie"),
    /** Link a la pestaña de respaldo en Google Sheets. */
    sheetUrl: text("sheet_url"),
    /** Para históricos: archivo y pestaña/bloque de donde salió. */
    origenRef: text("origen_ref"),
    origen: origenRegistro("origen").notNull().default("app"),
    creadoPor: integer("creado_por").references(() => usuarios.id, { onDelete: "set null" }),
    revisadoPor: integer("revisado_por").references(() => usuarios.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("presupuestos_trabajo_idx").on(t.trabajoId),
    index("presupuestos_fecha_idx").on(t.fecha),
  ],
);

export const presupuestoItems = pgTable(
  "presupuesto_items",
  {
    id: serial("id").primaryKey(),
    presupuestoId: integer("presupuesto_id")
      .notNull()
      .references(() => presupuestos.id, { onDelete: "cascade" }),
    /** Sub-items (los "*" o "a. b. c." debajo de un item). No suman al total. */
    parentId: integer("parent_id").references((): AnyPgColumn => presupuestoItems.id, {
      onDelete: "cascade",
    }),
    orden: integer("orden").notNull().default(0),
    seccion: text("seccion"),
    descripcion: text("descripcion").notNull(),
    cantidad: numeric("cantidad", { precision: 10, scale: 2 }).notNull().default("1"),
    precioUnitario: quetzales("precio_unitario"),
    /** Total de la línea. */
    precio: quetzales("precio"),
    /** Precio en "?" (aún no definido). */
    precioPendiente: boolean("precio_pendiente").notNull().default(false),
    productoId: integer("producto_id").references(() => productos.id, { onDelete: "set null" }),
  },
  (t) => [
    index("items_presupuesto_idx").on(t.presupuestoId),
    index("items_producto_idx").on(t.productoId),
  ],
);

/* ───────────────────────── Relaciones ───────────────────────── */

export const clientesRelations = relations(clientes, ({ many }) => ({
  alias: many(clienteAlias),
  buses: many(buses),
  trabajos: many(trabajos),
}));

export const clienteAliasRelations = relations(clienteAlias, ({ one }) => ({
  cliente: one(clientes, { fields: [clienteAlias.clienteId], references: [clientes.id] }),
}));

export const busesRelations = relations(buses, ({ one, many }) => ({
  cliente: one(clientes, { fields: [buses.clienteId], references: [clientes.id] }),
  trabajos: many(trabajos),
}));

export const productosRelations = relations(productos, ({ many }) => ({
  alias: many(productoAlias),
  items: many(presupuestoItems),
}));

export const productoAliasRelations = relations(productoAlias, ({ one }) => ({
  producto: one(productos, { fields: [productoAlias.productoId], references: [productos.id] }),
}));

export const trabajosRelations = relations(trabajos, ({ one, many }) => ({
  cliente: one(clientes, { fields: [trabajos.clienteId], references: [clientes.id] }),
  bus: one(buses, { fields: [trabajos.busId], references: [buses.id] }),
  presupuestos: many(presupuestos),
}));

export const presupuestosRelations = relations(presupuestos, ({ one, many }) => ({
  trabajo: one(trabajos, { fields: [presupuestos.trabajoId], references: [trabajos.id] }),
  items: many(presupuestoItems),
}));

export const presupuestoItemsRelations = relations(presupuestoItems, ({ one }) => ({
  presupuesto: one(presupuestos, {
    fields: [presupuestoItems.presupuestoId],
    references: [presupuestos.id],
  }),
  producto: one(productos, {
    fields: [presupuestoItems.productoId],
    references: [productos.id],
  }),
  parent: one(presupuestoItems, {
    fields: [presupuestoItems.parentId],
    references: [presupuestoItems.id],
  }),
}));
