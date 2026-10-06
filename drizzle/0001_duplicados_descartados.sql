CREATE TABLE "duplicados_descartados" (
	"tipo" text NOT NULL,
	"a_id" integer NOT NULL,
	"b_id" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicados_descartados_tipo_a_id_b_id_pk" PRIMARY KEY("tipo","a_id","b_id")
);
