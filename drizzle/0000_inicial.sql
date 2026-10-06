CREATE TYPE "public"."estado_presupuesto" AS ENUM('borrador', 'listo');--> statement-breakpoint
CREATE TYPE "public"."estado_trabajo" AS ENUM('cotizado', 'en_curso', 'terminado', 'no_concretado');--> statement-breakpoint
CREATE TYPE "public"."estado_usuario" AS ENUM('pendiente', 'activo', 'denegado');--> statement-breakpoint
CREATE TYPE "public"."origen_registro" AS ENUM('app', 'historico');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('admin', 'usuario');--> statement-breakpoint
CREATE TYPE "public"."tipo_presupuesto" AS ENUM('original', 'extra');--> statement-breakpoint
CREATE TABLE "buses" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer,
	"placa" text,
	"nombre" text,
	"descripcion" text,
	"notas" text,
	"origen" "origen_registro" DEFAULT 'app' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "cliente_alias_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"notas" text,
	"origen" "origen_registro" DEFAULT 'app' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuesto_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"presupuesto_id" integer NOT NULL,
	"parent_id" integer,
	"orden" integer DEFAULT 0 NOT NULL,
	"seccion" text,
	"descripcion" text NOT NULL,
	"cantidad" numeric(10, 2) DEFAULT '1' NOT NULL,
	"precio_unitario" numeric(12, 2),
	"precio" numeric(12, 2),
	"precio_pendiente" boolean DEFAULT false NOT NULL,
	"producto_id" integer
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" serial PRIMARY KEY NOT NULL,
	"trabajo_id" integer NOT NULL,
	"tipo" "tipo_presupuesto" DEFAULT 'original' NOT NULL,
	"numero" integer DEFAULT 0 NOT NULL,
	"titulo" text,
	"fecha" date,
	"lugar" text DEFAULT 'Ciudad Vieja Sacatepéquez',
	"estado" "estado_presupuesto" DEFAULT 'borrador' NOT NULL,
	"total" numeric(12, 2),
	"cerrado_en" numeric(12, 2),
	"anticipo" numeric(12, 2),
	"notas" text,
	"nota_pie" text,
	"sheet_url" text,
	"origen_ref" text,
	"origen" "origen_registro" DEFAULT 'app' NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producto_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"producto_id" integer NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "producto_alias_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text,
	"precio_referencia" numeric(12, 2),
	"unidad" text,
	"activo" boolean DEFAULT true NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productos_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "trabajos" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer NOT NULL,
	"bus_id" integer,
	"titulo" text,
	"estado" "estado_trabajo" DEFAULT 'cotizado' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"precio_cerrado" numeric(12, 2),
	"notas" text,
	"origen" "origen_registro" DEFAULT 'app' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol_usuario" DEFAULT 'usuario' NOT NULL,
	"estado" "estado_usuario" DEFAULT 'pendiente' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "buses" ADD CONSTRAINT "buses_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_alias" ADD CONSTRAINT "cliente_alias_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_parent_id_presupuesto_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."presupuesto_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_trabajo_id_trabajos_id_fk" FOREIGN KEY ("trabajo_id") REFERENCES "public"."trabajos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto_alias" ADD CONSTRAINT "producto_alias_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buses_placa_unq" ON "buses" USING btree ("placa") WHERE "buses"."placa" is not null;--> statement-breakpoint
CREATE INDEX "buses_cliente_idx" ON "buses" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "clientes_nombre_idx" ON "clientes" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "items_presupuesto_idx" ON "presupuesto_items" USING btree ("presupuesto_id");--> statement-breakpoint
CREATE INDEX "items_producto_idx" ON "presupuesto_items" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "presupuestos_trabajo_idx" ON "presupuestos" USING btree ("trabajo_id");--> statement-breakpoint
CREATE INDEX "presupuestos_fecha_idx" ON "presupuestos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "trabajos_cliente_idx" ON "trabajos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "trabajos_bus_idx" ON "trabajos" USING btree ("bus_id");