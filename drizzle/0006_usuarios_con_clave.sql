ALTER TABLE "usuarios" ADD COLUMN "clave_hash" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "clave_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "intentos_fallidos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "bloqueado_hasta" timestamp with time zone;