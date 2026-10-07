# reconstructora-presupuestos

App web para crear, gestionar y respaldar los presupuestos de un taller de reconstrucción
de buses. Reemplaza el flujo de copiar una pestaña de Excel y editarla a mano, y da
estadísticas de todo el histórico.

> Este repositorio es público y **no contiene datos del negocio**: ni Excel, ni PDFs, ni
> montos, ni clientes, ni correos, ni llaves. Los datos viven solo en la base de datos y
> los secretos en archivos locales ignorados por git o en secretos de Cloudflare.

## Qué hace

- **Presupuestos:** editor por secciones (ADENTRO, AFUERA, TROMPA…), autocompletar del
  catálogo con el precio sugerido, cantidades, detalles que no suman, precio "?",
  "cerrado en", anticipo y saldo. Sin límite de filas.
- **Trabajos y extras:** un trabajo agrupa el presupuesto original y sus extras
  (Extra 1, Extra 2…). Estado del trabajo: cotizado, en curso, terminado, no se concretó.
  Estado de cada presupuesto: borrador, cotización, en curso, terminado o cancelado; abonos por trabajo.
- **PDF** con el formato de siempre (membrete, secciones, TOTAL en verde, resumen,
  nota y firma), generado en el navegador.
- **Clientes, buses y productos:** búsqueda, edición, unir repetidos y sugerencias de
  posibles repetidos; historial de precios por producto.
- **Estadísticas** de todo el histórico: montos por año, temporada, clientes, lo más
  pedido, evolución de precios, categorías.
- **Acceso por solicitud:** cualquiera puede identificarse; queda pendiente hasta que el
  administrador lo autoriza en la página Usuarios.
- **Respaldo en Google Sheets:** cada presupuesto se copia a una pestaña con el formato de
  siempre, automáticamente al guardar o cambiar de estado.
- **Compartir** el PDF por WhatsApp o correo desde el menú de compartir del celular o la compu.
- **Búsqueda global** (Ctrl+K) y atajos de teclado (? muestra la lista).
- **Copia de toda la base** en un archivo (Ajustes o terminal) y restauración con un comando.

## Stack

| Parte | Tecnología |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind 4, TanStack Query, React Router |
| API | Hono en Cloudflare Workers (el mismo Worker sirve la app y `/api/*`) |
| Base de datos | Postgres en Neon + Drizzle ORM |
| Login | Cloudflare Access (Google o código al correo) + verificación del JWT en el Worker |
| PDF | pdf-lib en el navegador |
| Deploy | Cloudflare Workers Builds: cada push a `main` se publica solo |
| Tests | Vitest + PGlite (Postgres en memoria) |

Todo funciona en planes gratuitos.

## Requisitos

- **Node 22.12 o más nuevo** (recomendado 24; ver `.nvmrc`). En Windows con nvm:
  `nvm install 24` y `nvm use 24`. Con Node 20 fallan `wrangler` y `npm run dev`.
- Una base de Postgres en [Neon](https://neon.tech) con dos ramas: `dev` (para trabajar
  en local) y `production` (la de la app publicada).

## Empezar en una compu nueva

```bash
git clone <url-del-repo>
cd reconstructora-presupuestos
nvm use 24
npm install
cp .env.example .env            # pegar DATABASE_URL de la rama dev de Neon
cp .dev.vars.example .dev.vars  # la misma URL + DEV_AUTH_EMAIL con tu correo
npm run db:migrate              # crea/actualiza las tablas en dev
npm run db:seed-usuarios        # te registra como admin (SEED_USUARIOS en .env)
npm run dev                     # abre la app en http://localhost:5173
```

En local no hay login: `DEV_AUTH_EMAIL` dice quién eres.

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | App local (Vite + Worker) con la base de `.dev.vars` |
| `npm run typecheck` | Revisión de tipos (app, worker y scripts) |
| `npm test` | Pruebas |
| `npm run build` | Build de producción |
| `npm run check:privacidad` | Verifica que no se suba nada sensible (también corre en CI) |
| `npm run db:generate` | Crea una migración nueva a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones a la base de `.env` (dev) |
| `npm run db:migrate:produccion` | Pide la URL de production y le aplica las migraciones |
| `npm run db:seed-usuarios` | Registra los usuarios de `SEED_USUARIOS` como activos |
| `npm run configurar:produccion` | Primera vez: migra production, siembra usuarios y guarda la URL como secreto del Worker |
| `npm run configurar:google` | Respaldo en Sheets: lee el `.json` de la cuenta de servicio y el link del archivo, y guarda los secretos |
| `npm run db:copia` / `db:copia:produccion` | Copia de toda la base a `../copias` (JSON) |
| `npm run db:restaurar -- <archivo>` | Reemplaza la base por una copia (pide confirmar; `--produccion` para production) |
| `npm run etl:parse` | Lee los Excel históricos (fuera del repo) y genera `../_etl/` |
| `npm run etl:load` | Carga el histórico a la base de `.env` |
| `npm run etl:load:produccion` | Igual, pidiendo la URL de production |
| `npm run db:studio` | Explorador de la base (Drizzle Studio) |

## Publicar cambios

1. Antes de cada commit: `npm run check:privacidad`, `npm run typecheck`, `npm test` y `npm run build`.
2. Si el cambio trae una **migración nueva** (carpeta `drizzle/`):
   `npm run db:migrate` y `npm run db:migrate:produccion` **antes** del push.
3. `git push` a `main`. Cloudflare compila y publica en uno o dos minutos.

## Configuración

| Dónde | Qué |
|---|---|
| `.env` (local, ignorado) | `DATABASE_URL` (dev), `DATA_DIR`, `ETL_OUT_DIR`, `SEED_USUARIOS` |
| `.dev.vars` (local, ignorado) | `DATABASE_URL` (dev), `DEV_AUTH_EMAIL` |
| Secretos del Worker (`wrangler secret put`) | `DATABASE_URL` (production); `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SHEETS_RESPALDO_ID` (con `npm run configurar:google`) |
| `wrangler.jsonc` → `vars` | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (públicos) |
| Página **Ajustes** de la app (admin) | Membrete del PDF: empresa, correo, teléfono, firma, lugar, nota y logo. Se guarda en la base (una vez en dev y otra en production) |

## Histórico (Excel → base)

Los Excel viven fuera del repo (por defecto en la carpeta padre). `npm run etl:parse`
genera en `../_etl/` el `historico.json`, un `revision.md` con lo que hay que revisar
y un `estadisticas.md`. Las correcciones manuales van en `../overrides.json`. Después,
`npm run etl:load`. Una vez que se empieza a trabajar en la app publicada, **no volver a
cargar el histórico en production** (se perderían cambios hechos a trabajos históricos).

## Estructura

```
src/client/   React: páginas, editor de presupuestos, PDF
src/worker/   API (Hono): rutas, login, errores
src/db/       Esquema de la base y consultas de estadísticas
src/shared/   Código común: dinero, fechas, claves, cálculos, PDF
scripts/      ETL del histórico, migraciones y configuración de producción
drizzle/      Migraciones SQL
docs/         Plan por fases y guía de despliegue
```

## Más documentación

- Plan por fases: [`docs/PLAN.md`](docs/PLAN.md)
- Cuentas, despliegue y migraciones: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)
- Guía para el asistente de código y decisiones: [`CLAUDE.md`](CLAUDE.md)
