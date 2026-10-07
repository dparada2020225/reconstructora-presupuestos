# Base de datos

Postgres en Neon. La fuente de verdad es `src/db/schema.ts` (Drizzle); las migraciones SQL están
en `drizzle/`. Nombres de tablas y columnas en español y `snake_case`.

## Diagrama

```
usuarios ◀──────────────── creado_por ─────────────┐
                                                    │
clientes ──< cliente_alias                          │
   │ └──< buses (cliente_id, set null)              │
   │          │                                     │
   └──< trabajos (cliente_id restrict, bus_id set null)
           ├──< presupuestos (cascade) ──< presupuesto_items (cascade)
           │                                 └─ parent_id → presupuesto_items (sub-items)
           │                                 └─ producto_id → productos (set null)
           └──< pagos (cascade)

productos ──< producto_alias
configuracion (clave → valor)        duplicados_descartados (tipo, a_id, b_id)
```

## Tablas

### `usuarios`
Quién puede entrar. `email` único, `nombre`, `rol` (`admin` | `usuario`), `estado`
(`pendiente` | `activo` | `denegado`), `creado_en`, `actualizado_en`.
El primero se siembra con `npm run db:seed-usuarios`; los demás se crean solos como `pendiente`.

### `clientes` y `cliente_alias`
`clientes`: `nombre`, `telefono`, `notas`, `origen` (`app` | `historico`).
`cliente_alias`: otras formas en que aparece escrito (normalizado: minúsculas, sin tildes ni signos;
`alias` único). Sirven para la búsqueda, para unir repetidos y para que el ETL reconozca clientes.

### `buses`
`cliente_id` (puede quedar null), `placa` (única si existe, normalizada), `nombre` ("La Estrella"),
`descripcion`, `notas`, `origen`. Casi ningún histórico trae placa: un bus se reconoce por placa
**o** por nombre.

### `productos` y `producto_alias`
Catálogo: `nombre` único, `categoria` (ADENTRO, AFUERA, TROMPA…), `precio_referencia`, `unidad`,
`activo`, `notas`. `producto_alias`: descripciones normalizadas que apuntan al producto (así una
línea escrita a mano se enlaza sola al catálogo).

### `trabajos`
Agrupa el original y sus extras: `cliente_id` (no se puede borrar un cliente con trabajos),
`bus_id`, `titulo`, `estado` (`cotizado` | `en_curso` | `terminado` | `no_concretado`, **derivado**
de sus presupuestos), `fecha_inicio`, `fecha_fin` (se pone al terminar), `precio_cerrado`
(histórico), `notas`, `origen`.

### `presupuestos`
Un documento. `trabajo_id`, `tipo` (`original` | `extra`), `numero` (0 = original; 1, 2… extras),
`titulo`, `fecha`, `lugar`, `estado` (`borrador` | `cotizacion` | `en_curso` | `terminado` |
`cancelado`), `total` (suma de líneas, se recalcula al guardar), `cerrado_en`, `anticipo`, `notas`,
`nota_pie`, `sheet_url` (pestaña de respaldo, con su gid), `respaldado_en`, `respaldo_error`,
`origen_ref` (archivo y pestaña del Excel, para históricos), `origen`, `creado_por`.

### `presupuesto_items`
Líneas. `presupuesto_id`, `parent_id` (sub-item / detalle de otra línea), `orden`, `seccion`,
`descripcion`, `cantidad`, `precio_unitario`, `precio` (total de la línea), `precio_pendiente`
("?", no suma), `producto_id`. Los detalles creados en la app son sub-items sin precio.

### `pagos`
Abonos del **trabajo** (no del presupuesto): `trabajo_id`, `fecha`, `monto`, `forma`
(`efectivo` | `cheque` | `transferencia` | null), `nota`, `creado_por`, `creado_en`. No salen en el PDF.

### `configuracion`
Clave → valor. Membrete del PDF: `empresa`, `correo`, `telefono`, `firma`, `nota`, `lugar`,
`logo`, `iconosEmpresa`, `iconosTelefono` (imágenes como data URL). Además `ultima_copia_base`
(fecha de la última copia descargada). Vive en la base porque el repo es público; hay que llenarla
**una vez en cada base** (dev y production).

### `duplicados_descartados`
Pares que la app sugirió como posibles repetidos y alguien marcó "no son el mismo":
`tipo` (`clientes` | `productos`), `a_id` < `b_id`. Sin llave foránea; se limpian al unir o borrar.

## Convenciones

- Dinero: `numeric(12,2)`. Drizzle lo entrega como texto: siempre `Number(...)` al leer.
- Fechas de negocio: `date` (`AAAA-MM-DD`, hora de Guatemala con `hoyGuatemala()`); marcas de
  tiempo: `timestamptz`.
- `origen = 'historico'` marca lo que vino de los Excel. `etl:load` borra y vuelve a crear solo eso.
- Borrados: un cliente o bus con trabajos no se borra (se une); un producto usado no se borra (se
  desactiva o se une); un presupuesto solo si es borrador.

## Migraciones

| Archivo | Qué hace |
|---|---|
| `0000_inicial` | Esquema base: usuarios, clientes, buses, productos, trabajos, presupuestos, items. |
| `0001_duplicados_descartados` | Tabla de pares "no son el mismo". |
| `0002_configuracion` | Tabla del membrete. |
| `0003_estados_y_pagos` | 5 estados por presupuesto (editada a mano: los `listo` toman el estado de su trabajo) y tabla de pagos. |
| `0004_abonos_por_trabajo` | Pagos pasan de presupuesto a trabajo (editada a mano; el anticipo sigue en el presupuesto). |
| `0005_respaldo_sheets` | `respaldado_en` y `respaldo_error` en presupuestos. |

Cómo crear y aplicar una migración: [DESARROLLO.md](DESARROLLO.md#cambiar-la-base-de-datos).
Las migraciones editadas a mano se prueban con datos en el formato viejo en `src/db/migracion.test.ts`.

## Ramas de Neon

- `production`: la app publicada. Su URL es secreto del Worker (`DATABASE_URL`) y los scripts que la
  tocan la **piden** al correr (nunca queda en `.env`).
- `dev`: para trabajar en local (`.env` y `.dev.vars`).
- Para probar algo arriesgado (restaurar una copia, una migración), crear una rama nueva desde
  `production` en Neon y apuntar ahí.
