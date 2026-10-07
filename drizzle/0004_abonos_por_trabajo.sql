-- Los abonos pasan a ser de todo el trabajo (original + extras). Editada a mano: se llena
-- trabajo_id con el trabajo del presupuesto de cada abono antes de exigirla.
ALTER TABLE "pagos" ADD COLUMN "trabajo_id" integer;--> statement-breakpoint
UPDATE "pagos" SET "trabajo_id" = "presupuestos"."trabajo_id" FROM "presupuestos" WHERE "presupuestos"."id" = "pagos"."presupuesto_id";--> statement-breakpoint
-- El anticipo vuelve a ser un campo del presupuesto: se quitan los abonos que la 0003 creó a partir de él.
DELETE FROM "pagos" WHERE "forma" IS NULL AND "nota" = 'Anticipo anotado en el presupuesto';--> statement-breakpoint
ALTER TABLE "pagos" ALTER COLUMN "trabajo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_presupuesto_id_presupuestos_id_fk";--> statement-breakpoint
DROP INDEX "pagos_presupuesto_idx";--> statement-breakpoint
ALTER TABLE "pagos" DROP COLUMN "presupuesto_id";--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_trabajo_id_trabajos_id_fk" FOREIGN KEY ("trabajo_id") REFERENCES "public"."trabajos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagos_trabajo_idx" ON "pagos" USING btree ("trabajo_id");
