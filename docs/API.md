# API

Todo vive bajo `/api` en el mismo Worker que sirve la app. Cuerpos y respuestas en JSON.
Los tipos que usa el cliente están en `src/client/api.ts` y los de entrada en
`src/shared/presupuesto.ts`.

## Autenticación

- En producción, Cloudflare Access pone el JWT en `Cf-Access-Jwt-Assertion`; el Worker lo verifica
  y busca el correo en `usuarios` (ver [ARQUITECTURA.md](ARQUITECTURA.md#autenticación-y-permisos)).
- En local, `DEV_AUTH_EMAIL` (`.dev.vars`) hace de usuario.
- Todas las rutas salvo `/health` exigen un usuario **activo**. Las marcadas **admin** exigen rol admin.

## Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| 400 | Datos inválidos (zod) o id inválido | `{ error: "mensajes · separados", detalles? }` |
| 401 | Sin identidad (sin JWT válido) | `{ error: "No autenticado" }` |
| 403 | Usuario `pendiente` / `denegado`, o sin rol | `{ error: "pendiente" \| "denegado" \| "Sin permiso" }` |
| 404 | No existe | `{ error: "… no encontrado" }` |
| 409 | Conflicto (ya existe, tiene trabajos, no es borrador…) | `{ error: "…" }` |
| 502 / 503 | Google falló / respaldo no configurado | `{ error: "…" }` |

Montos: números en quetzales (2 decimales). Fechas: `AAAA-MM-DD`. Timestamps: ISO.

## General

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | **Público.** `{ ok, db }` (503 si la base no responde). |
| GET | `/me` | El usuario actual `{ id, email, nombre, rol }`. |

## Usuarios (admin)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/usuarios` | Todos, con `estado` y `creadoEn`. |
| PATCH | `/usuarios/:id` | `{ estado?: "pendiente"\|"activo"\|"denegado", rol?: "admin"\|"usuario", nombre? }`. No te puedes quitar el acceso ni el rol de admin a ti mismo. |

## Presupuestos

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/presupuestos` | Lista completa (filas con cliente, bus, placa, estado, total, estado del trabajo). |
| GET | `/presupuestos/:id` | Detalle: encabezado, `items` (con `parentId` para detalles), `trabajo`, `hermanos` (los demás documentos del trabajo), datos del respaldo (`sheetUrl`, `respaldadoEn`, `respaldoError`). |
| POST | `/presupuestos` | Crea. Con `clienteId` (y `busId?`) → **trabajo nuevo** con su original. Con `trabajoId` → **extra** de ese trabajo (numerado solo: Extra 1, 2…). Responde 201 `{ id, trabajoId }`. |
| PUT | `/presupuestos/:id` | Reemplaza encabezado y **todas** las líneas. |
| PATCH | `/presupuestos/:id/estado` | `{ estado: "borrador"\|"cotizacion"\|"en_curso"\|"terminado"\|"cancelado" }`. Recalcula el estado del trabajo. |
| POST | `/presupuestos/:id/respaldo` | Copia ya a Google Sheets. `{ url }`. |
| DELETE | `/presupuestos/:id` | Solo borradores (409 si no). Si era el único documento, borra también el trabajo. |

Cuerpo de POST/PUT (`PresupuestoEntrada`):

```jsonc
{
  "clienteId": 12,            // trabajo nuevo (o cambiar cliente del trabajo)
  "busId": 7,                 // opcional
  "trabajoId": null,          // o el id del trabajo para un EXTRA
  "titulo": null,
  "fecha": "2026-10-07",
  "lugar": "Pueblo",
  "cerradoEn": null,          // precio negociado
  "anticipo": null,           // sale en el PDF
  "notas": null,              // internas
  "notaPie": null,            // reemplaza la nota del membrete en este PDF
  "lineas": [
    {
      "seccion": "ADENTRO",
      "descripcion": "Pintura",
      "cantidad": 1,
      "precioUnitario": 4500,   // null = sin precio
      "precioPendiente": false, // true = "?" (no suma)
      "productoId": null,       // si es null se enlaza por alias de la descripción
      "detalles": ["Color azul"]// renglones debajo, no suman
    }
  ]
}
```

Límites: 500 líneas, 60 detalles por línea, descripción 400 caracteres.
Si el presupuesto es de la app y no es borrador, guardar o cambiar el estado dispara el respaldo en
Sheets en segundo plano.

## Trabajos

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/trabajos/:id` | Trabajo con sus `presupuestos`, `cotizado`, `monto` (con "cerrado en"), `abonado`, `pagos`, notas. |
| PATCH | `/trabajos/:id` | `{ titulo?, notas? }`. El estado no se edita: se calcula. |
| POST | `/trabajos/:id/pagos` | Abono: `{ fecha, monto, forma: "efectivo"\|"cheque"\|"transferencia"\|null, nota? }`. |
| PATCH | `/trabajos/:id/pagos/:pagoId` | Edita un abono (mismos campos). |
| DELETE | `/trabajos/:id/pagos/:pagoId` | Borra un abono. |

## Clientes

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/clientes` | Lista con buses, trabajos, última fecha y alias. |
| GET | `/clientes/:id` | Detalle con buses y trabajos. |
| POST | `/clientes` | `{ nombre, telefono?, notas? }` → 201 con el cliente creado. |
| PATCH | `/clientes/:id` | Mismos campos, opcionales. |
| DELETE | `/clientes/:id` | 409 si tiene trabajos (unir en su lugar). |
| POST | `/clientes/:id/unir` | `{ otroId }`: pasa trabajos, buses y alias del otro a este (teléfono si falta, notas juntas) y borra el otro. |
| GET | `/clientes/duplicados/descartados` | Pares marcados "no son el mismo" `[{ aId, bId }]`. |
| POST | `/clientes/duplicados/descartados` | `{ aId, bId }`. |

## Buses

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/buses` | Lista con cliente, trabajos y última fecha. |
| GET | `/buses/:id` | Detalle con trabajos. |
| POST | `/buses` | `{ clienteId?, placa?, nombre?, descripcion?, notas? }` (placa o nombre obligatorio; la placa se normaliza y es única). |
| PATCH | `/buses/:id` | Mismos campos. |
| DELETE | `/buses/:id` | 409 si tiene trabajos. |
| POST | `/buses/:id/unir` | `{ otroId }`: pasa los trabajos y lo que le falte (placa, nombre…) y borra el otro. |

## Productos (catálogo)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/productos` | Lista con veces usado, último precio y fecha, alias, activo. |
| GET | `/productos/:id` | Detalle con `usos` (cada línea donde se cotizó) y `porAnio` (mediana por año). |
| POST | `/productos` | `{ nombre, categoria?, precioReferencia?, unidad?, notas? }`. |
| PATCH | `/productos/:id` | Mismos campos + `activo`. |
| DELETE | `/productos/:id` | 409 si ya se usó (desactivar o unir). |
| POST | `/productos/:id/unir` | `{ otroId }`: pasa sus líneas y alias y borra el otro. |
| GET/POST | `/productos/duplicados/descartados` | Igual que en clientes. |

## Estadísticas

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/estadisticas?desde=AAAA&hasta=AAAA` | Resumen, series por año y mes, clientes, productos, precios, categorías y buses. Excluye borradores y cancelados. Cálculo en `src/db/estadisticas.ts` y `src/shared/estadisticas.ts`. |

## Configuración (membrete y respaldo)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/configuracion` | Membrete: `empresa, correo, telefono, firma, nota, lugar, logo, iconosEmpresa, iconosTelefono` (imágenes como data URL). |
| PUT | `/configuracion` | **admin.** Cualquiera de esos campos. Imágenes PNG/JPG, máx. ~500 KB. |
| GET | `/configuracion/respaldo` | `{ configurado, pendientes }`. |
| POST | `/configuracion/respaldo/pendientes` | Copia hasta 5 pendientes: `{ hechos, errores, pendientes }`. |
| POST | `/configuracion/respaldo/rehacer` | **admin.** Marca todos los presupuestos de la app como pendientes. |

## Copia de toda la base (admin)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/copia-base` | `{ tablas: [{ nombre, filas }], migraciones, porPagina, ultima }`. |
| GET | `/copia-base/:tabla?pagina=N` | `{ filas }` (1000 por página, en el formato de `row_to_json`). |
| GET | `/copia-base/ultima` | `{ ultima }` (fecha de la última copia descargada). |
| POST | `/copia-base/hecha` | Anota que se descargó una copia ahora. |

El navegador arma con eso el archivo `{ app, version, creada, migraciones, tablas }` que restaura
`npm run db:restaurar` (ver [OPERACION.md](OPERACION.md#restaurar-una-copia)).
