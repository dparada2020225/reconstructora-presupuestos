# Histórico: de los Excel a la base

Todo el histórico (antes de la app) vive en dos Excel que **nunca entran al repo**. El ETL los lee,
los ordena en trabajos/presupuestos/clientes/buses/productos, genera reportes para revisar a mano y
los carga a la base.

```
DATA_DIR/                                  ETL_OUT_DIR/ (por defecto ../_etl)
  PRESUPUESTO.xlsx          ─┐               historico.json   ← lo que se carga
  PRESUPUESTOS VIEJITOS.xlsx ├─ etl:parse ─▶ revision.md      ← para revisar a mano
  overrides.json (opcional) ─┘               estadisticas.md  ← números rápidos
                                                    │
                                     etl:load ──────┘──▶ Postgres (origen = 'historico')
```

## Comandos

```bash
npm run etl:parse            # Excel → ../_etl/{historico.json, revision.md, estadisticas.md}
npm run etl:load             # historico.json → base de .env (dev)
npm run etl:load:produccion  # igual, pidiendo la URL de production
```

`DATA_DIR` (por defecto la carpeta padre del repo) y `ETL_OUT_DIR` (por defecto `../_etl`) se
cambian en `.env`. El script **se niega a escribir dentro del repo**.

## Fuentes

- **`PRESUPUESTO.xlsx`**: una pestaña por presupuesto (formato FORMATO: lugar y fecha, cliente,
  placa/transporte, líneas con `-` y precio en la columna D, TOTAL, NOTA, firma).
- **`PRESUPUESTOS VIEJITOS.xlsx`**: una sola hoja con bloques que empiezan en "Lugar y Fecha";
  precios como texto (`Q.8,000,-`) en la columna J o E.

Código: `scripts/etl/parse-nuevo.ts`, `parse-viejo.ts`, `lineas.ts` (qué es cada renglón),
`agrupar.ts` (trabajos, extras, versiones), `normalizar.ts`, `reporte.ts`, `cargar.ts`.

## Reglas

- **Secciones**: renglón en MAYÚSCULAS sin precio. `RESUMEN`, `RESUMIENDO` y `TOTALES` no son
  secciones (lo que viene debajo es el resumen y no se carga como líneas). `ANTICIPOS` se guarda
  como anticipo; `CERRADO EN` es el precio negociado.
- **Sub-items** (`*`, `a.`, `b.`…) sin precio: detalle de la línea de arriba, no suman. Con precio
  en la columna de precios sí cuentan (así sumaba el Excel).
- Cada `TOTAL` se compara con la suma de las líneas de arriba; las diferencias van a `revision.md`.
- **Pestañas partidas**: mismo cliente y misma fecha → un solo presupuesto (el Excel tenía límite
  de 35 filas por pestaña).
- **Extras**: nombre con EXTRA, OTRAS, ACCESORIOS o ARREGLO → extra del último trabajo del cliente.
  Sin marca, pero ≤31 días después y mismo bus → extra inferido (se reporta).
- **Versiones repetidas**: mismo cliente, misma fecha y ≥50% de líneas iguales → se usa la última.
- **Clientes**: se unen solo si su clave normalizada es idéntica; los parecidos se **sugieren** en
  el reporte (y luego en la app, panel de posibles repetidos).
- **Buses**: placa si hay; si no, el nombre del bus dentro del cliente.
- **Productos**: clave normalizada + agrupación por similitud ≥ 0.88; entran al catálogo si
  aparecen 2 o más veces.
- Todo el histórico entra como `terminado` (salvo lo marcado como no concretado).

## Revisar y corregir: `overrides.json`

Va en `DATA_DIR` (junto a los Excel; también ignorado por git). Después de editarlo, volver a
correr `etl:parse`. Al final de `revision.md` hay un ejemplo.

```jsonc
{
  "clientes":      { "clave que sobra": "Nombre correcto" },     // unir clientes
  "clientePorDoc": { "PRESUPUESTO.xlsx › PESTAÑA": "Cliente" },  // corregir el cliente de un documento
  "buses":         { "texto del transporte": "Nombre del bus" }, // "" = sin bus
  "productos":     { "descripcion normalizada": "Producto" },
  "trabajoPorDoc": { "ref del doc": "clave-de-trabajo" },        // misma clave = mismo trabajo
  "tipoPorDoc":    { "ref del doc": "extra" },                   // forzar original/extra
  "ignorar":       ["ref del doc"],                              // duplicados, pruebas, plantillas
  "noConcretados": ["clave-de-trabajo"]
}
```

Las *refs* salen en `revision.md` (por ejemplo `PRESUPUESTO.xlsx › NOMBRE DE PESTAÑA` o
`PRESUPUESTOS VIEJITOS.xlsx › fila 1289`).

## Cargar

`cargar.ts` es **idempotente**: borra todo lo que tenga `origen = 'historico'` y lo vuelve a crear,
en ~20 consultas por bloques. Lo creado en la app no se toca. Clientes y productos se reconocen
por alias, así que las uniones hechas en la app se respetan.

> **Cuidado en producción:** una vez que se empieza a usar la app publicada, no volver a correr
> `etl:load:produccion`: los cambios hechos en la app a trabajos o buses del histórico se perderían.
> Si hay que corregir un histórico después de eso, se corrige en la app.

## Problemas conocidos del histórico

Algunos Excel traen el **resumen al final sin el título RESUMEN** (o partido en otra pestaña), y el
ETL lo lee como líneas: el total de ese presupuesto queda inflado (las secciones se suman dos
veces). Se nota en Estadísticas (por ejemplo una "rebaja al cerrar" exagerada). Para encontrarlos:
líneas cuya descripción es igual al nombre de una sección del mismo presupuesto. Se corrigen
editando ese presupuesto en la app (o, antes de cargar a producción, en el Excel/overrides).
