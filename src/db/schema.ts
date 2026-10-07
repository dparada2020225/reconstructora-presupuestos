import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ───────────────────────── Enums ───────────────────────── */

/** admin: además de usar la app, aprueba o niega el acceso a otros. usuario: todo lo demás. */
export const rolUsuario = pgEnum("rol_usuario", ["admin", "usuario"]);

/** Quien entra por primera vez queda "pendiente" hasta que un admin lo autoriza. */
export const estadoUsuario = pgEnum("estado_usuario", ["pendiente", "activo", "denegado"]);

/** Estado del trabajo completo (original + extras). */
export const estadoTrabajo = pgEnum("estado_trabajo", [
  "cotizado", // presupuesto entregado, aún no arranca
  "en_curso",
  "terminado",
  "no_concretado",
]);

/**
 * Estado de cada presupuesto (original o extra):
 * borrador (se está armando) → cotizacion (PDF entregado al cliente) → en_curso (aceptado,
 * se está trabajando) → terminado. cancelado = el cliente no lo aceptó o se canceló.
 * El estado del TRABAJO se calcula a partir de estos (ver shared/estados.ts).
 */
export const estadoPresupuesto = pgEnum("estado_presupuesto", ["borrador", "cotizacion", "en_curso", "terminado", "cancelado"]);

/** Forma de pago de un abono. null = no se sabe (anticipos que venían del Excel). */
export const formaPago = pgEnum("forma_pago", ["efectivo", "cheque", "transferencia"]);

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
  rol: rolUsuario("rol").notNull().default("usuario"),
  estado: estadoUsuario("estado").notNull().default("pendiente"),
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

/**
 * Pares que la app sugirió como posibles duplicados y alguien marcó "no son el mismo".
 * aId < bId siempre. Sin llave foránea (sirve para clientes y productos); se limpian al unir o borrar.
 */
export const duplicadosDescartados = pgTable(
  "duplicados_descartados",
  {
    tipo: text("tipo").notNull(), // "clientes" | "productos"
    aId: integer("a_id").notNull(),
    bId: integer("b_id").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tipo, t.aId, t.bId] })],
);

/**
 * Ajustes de la app (clave → valor): membrete del PDF (empresa, correo, teléfono, firma,
 * nota, lugar, logo como data URL). Viven en la base y no en el código porque el repo es público.
 */
export const configuracion = pgTable("configuracion", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
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
    /** Anticipo que se anota en el presupuesto (sale en el PDF). Los abonos del trabajo son aparte. */
    anticipo: quetzales("anticipo"),
    notas: text("notas"),
    notaPie: text("nota_pie"),
    /** Link a la pestaña de respaldo en Google Sheets. */
    sheetUrl: text("sheet_url"),
    /** Para históricos: archivo y pestaña/bloque de donde salió. */
    origenRef: text("origen_ref"),
    origen: origenRegistro("origen").notNull().default("app"),
    creadoPor: integer("creado_por").references(() => usuarios.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("presupuestos_trabajo_idx").on(t.trabajoId),
    index("presupuestos_fecha_idx").on(t.fecha),
  ],
);

/**
 * Abonos que el cliente da al TRABAJO (original + extras, todo junto). Se registran desde
 * cualquier presupuesto del trabajo. No salen en el PDF (ahí sale el anticipo de cada presupuesto).
 */
export const pagos = pgTable(
  "pagos",
  {
    id: serial("id").primaryKey(),
    trabajoId: integer("trabajo_id")
      .notNull()
      .references(() => trabajos.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    monto: quetzales("monto").notNull(),
    forma: formaPago("forma"),
    nota: text("nota"),
    creadoPor: integer("creado_por").references(() => usuarios.id, { onDelete: "set null" }),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pagos_trabajo_idx").on(t.trabajoId)],
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
