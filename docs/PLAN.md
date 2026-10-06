# Plan por fases

Objetivo: que armar un presupuesto tome minutos en vez de copiar y editar una
pestaña de Excel, que salga el PDF listo para pasárselo al jefe, que quede respaldo en
Google Sheets con el formato de siempre y que haya estadísticas de todo el histórico.

Costo objetivo: **Q0/mes** (dominio propio opcional).

## Fase 0 — Base ✅
- Repo, `.gitignore` estricto, `check:privacidad`, CI (privacidad + typecheck + tests + build).
- React + Vite en el cliente; Hono en un Worker de Cloudflare que también sirve el SPA.
- Auth: Cloudflare Access + verificación del JWT + tabla `usuarios`.
- Solicitudes de acceso: quien entra queda pendiente; el admin autoriza o niega en `/usuarios`.
  Todos los autorizados tienen los mismos permisos.
- `/api/health` (público), `/api/me`, `/api/usuarios` (admin).

## Fase 1 — Modelo de datos + migración del histórico ✅ (falta correr contra Neon)
- Esquema: usuarios, clientes (+alias), buses, productos (+alias), trabajos,
  presupuestos (original/extra), items (con sub-items).
- ETL: lee los dos Excel, valida totales, une pestañas partidas, detecta extras y
  versiones repetidas, arma catálogo de productos, genera `revision.md` y `estadisticas.md`.
- Correcciones manuales vía `overrides.json` y volver a correr.
- **Pendiente:** revisar `revision.md` con quien conoce los trabajos, ajustar overrides, cargar a Neon.

## Fase 2 — Estadísticas ✅
- Totales: clientes, buses, trabajos, presupuestos, monto cotizado y cerrado.
- Por cliente: trabajos, buses, monto, frecuencia, tiempo entre visitas.
- Por bus: cuántas veces vino y qué se le hizo.
- Lo más pedido (veces y monto), por categoría (adentro, afuera, trompa…).
- Evolución del precio de cada producto en el tiempo (mediana por año/trimestre).
- Extras: % de trabajos con extras y cuánto agregan sobre el original.
- "Cerrado en" vs cotizado: rebaja promedio.
- Temporada: presupuestos por mes.
- Filtros por rango de fechas, cliente y categoría.

## Fase 3 — CRUD ✅
- Clientes (con alias y teléfono), buses (placa opcional, nombre, cliente), catálogo
  de productos (categoría, precio de referencia, historial de precios usados).
- Búsqueda rápida; fusionar clientes/productos duplicados desde la UI.

## Fase 4 — Editor de presupuestos (lo que usa la editora)
- Nuevo presupuesto: cliente → bus → secciones → items desde el catálogo con el
  último precio sugerido (o texto libre). Sub-items, cantidades, "?" pendiente.
- Sin límite de filas; totales por sección y total final automáticos.
- Extras: abrir un trabajo y agregar "Extra N" (ve lo anterior y el resumen).
- Duplicar un presupuesto viejo como base.
- Estados: borrador → listo (al generar el PDF). La revisión del jefe y el envío al
  cliente siguen fuera de la app.
- Estado del trabajo: cotizado / en curso / terminado / no concretado.
- **PDF** con el formato de la plantilla (logo, encabezado, nota, firma), listo para pasar por WhatsApp/correo.

## Fase 5 — Respaldo en Google Sheets
- Un archivo por año en el Drive del admin, compartido con la cuenta de servicio.
- Cada presupuesto listo → se duplica la pestaña plantilla (FORMATO), se llena y se
  insertan filas si hace falta. Link guardado en `presupuestos.sheet_url`.
- Si Google falla, el presupuesto igual se guarda y se reintenta después.

## Fase 6 — Pulido
- Compartir PDF por WhatsApp, búsqueda global, atajos.
- Respaldo periódico de la base (export a Drive).
- Pagos/anticipos formales si se necesitan.
