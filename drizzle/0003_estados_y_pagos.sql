CREATE TYPE "public"."forma_pago" AS ENUM('efectivo', 'cheque', 'transferencia');--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" serial PRIMARY KEY NOT NULL,
	"presupuesto_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"forma" "forma_pago",
	"nota" text,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presupuestos" ALTER COLUMN "estado" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "presupuestos" ALTER COLUMN "estado" SET DEFAULT 'borrador'::text;--> statement-breakpoint
-- "listo" ya no existe: toma el estado que tenía su trabajo (a mano, no lo genera drizzle).
UPDATE "presupuestos" SET "estado" = CASE "trabajos"."estado"::text
  WHEN 'en_curso' THEN 'en_curso'
  WHEN 'terminado' THEN 'terminado'
  WHEN 'no_concretado' THEN 'cancelado'
  ELSE 'cotizacion' END
FROM "trabajos" WHERE "trabajos"."id" = "presupuestos"."trabajo_id" AND "presupuestos"."estado" = 'listo';--> statement-breakpoint
DROP TYPE "public"."estado_presupuesto";--> statement-breakpoint
CREATE TYPE "public"."estado_presupuesto" AS ENUM('borrador', 'cotizacion', 'en_curso', 'terminado', 'cancelado');--> statement-breakpoint
ALTER TABLE "presupuestos" ALTER COLUMN "estado" SET DEFAULT 'borrador'::"public"."estado_presupuesto";--> statement-breakpoint
ALTER TABLE "presupuestos" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_presupuesto" USING "estado"::"public"."estado_presupuesto";--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagos_presupuesto_idx" ON "pagos" USING btree ("presupuesto_id");--> statement-breakpoint
-- Los anticipos que ya estaban anotados pasan a ser abonos (sin forma de pago conocida).
INSERT INTO "pagos" ("presupuesto_id", "fecha", "monto", "forma", "nota")
SELECT "id", COALESCE("fecha", CURRENT_DATE), "anticipo", NULL, 'Anticipo anotado en el presupuesto'
FROM "presupuestos" WHERE "anticipo" > 0;
