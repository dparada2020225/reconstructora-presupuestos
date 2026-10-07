# reconstructora-presupuestos

App web para crear, gestionar y respaldar los presupuestos de un taller de reconstrucción de
buses. Reemplaza el flujo de copiar una pestaña de Excel y editarla a mano: el presupuesto se arma
en minutos, sale el **PDF con el formato de siempre** listo para compartir, queda **respaldado en
Google Sheets** y hay **estadísticas** de todo el histórico.

> **Repositorio público sin datos del negocio.** Aquí no hay Excel, PDFs, montos, clientes, correos
> ni llaves. Los datos viven solo en la base de datos; los secretos, en archivos locales ignorados por
> git o en secretos de Cloudflare. `npm run check:privacidad` lo verifica en cada commit y en CI.

## Qué hace

| | |
|---|---|
| **Presupuestos** | Editor por secciones (ADENTRO, AFUERA, TROMPA…), autocompletar del catálogo con precio sugerido, cantidades y precio por unidad, detalles que no suman, precio "?" por definir, "cerrado en", anticipo y saldo. Sin límite de filas. Ctrl+S guarda. |
| **Trabajos y extras** | Un trabajo agrupa el original y sus extras (Extra 1, 2…). En los extras sale el resumen del trabajo y hay **documento unificado** (todo en un PDF). |
| **Estados** | Cada presupuesto: borrador, cotización, en curso, terminado o cancelado. El estado del trabajo se calcula solo. |
| **Abonos** | Pagos del trabajo completo (efectivo, cheque, transferencia) con aro de % pagado; se editan y borran. No salen en el PDF. |
| **PDF** | Generado en el navegador con el formato del Excel: logo, membrete con íconos de redes, secciones con TOTAL en verde, resumen, cerrado en, anticipo y saldo, nota y firma. Ver, descargar y **compartir** (WhatsApp, correo…). |
| **Respaldo en Google Sheets** | Cada presupuesto se copia solo a una pestaña con el formato de siempre al guardar o cambiar de estado. |
| **Clientes, buses y productos** | Búsqueda, edición, unir repetidos y sugerencias de posibles repetidos; historial de precios por producto. |
| **Búsqueda global** | Ctrl+K (o /) desde cualquier página: presupuestos, clientes, buses y productos. |
| **Estadísticas** | Montos por año, temporada, clientes, lo más pedido, evolución de precios, categorías, extras, rebaja al cerrar. |
| **Accesos** | Cualquiera se identifica (Google o código al correo); queda pendiente hasta que el admin lo autoriza. |
| **Copias de la base** | Descarga de toda la base en JSON (con recordatorio mensual) y restauración con un comando. |

Todo funciona en **planes gratuitos** (Cloudflare Workers + Access, Neon, Google Cloud).

## Documentación

| Documento | Para quién / qué |
|---|---|
| [docs/MANUAL.md](docs/MANUAL.md) | **Manual de uso** para quien arma presupuestos (sin nada técnico). |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Montar todo desde cero: Neon, Cloudflare, Access, Google, Sheets, membrete. |
| [docs/OPERACION.md](docs/OPERACION.md) | Día a día: publicar, usuarios, copias, restaurar, llaves, límites y **solución de problemas**. |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Cómo está hecha: componentes, autenticación, flujos, decisiones. |
| [docs/API.md](docs/API.md) | Todos los endpoints de `/api`. |
| [docs/BASE-DE-DATOS.md](docs/BASE-DE-DATOS.md) | Tablas, relaciones, convenciones y migraciones. |
| [docs/ETL.md](docs/ETL.md) | Cómo se migró el histórico de los Excel. |
| [docs/DESARROLLO.md](docs/DESARROLLO.md) | Guía para cambiar el código: reglas, comandos, recetas, trampas. |
| [docs/PLAN.md](docs/PLAN.md) | Plan por fases (todas hechas). |
| [CLAUDE.md](CLAUDE.md) | Contexto para el asistente de código y registro de decisiones. |

## Stack

| Parte | Tecnología |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind 4, TanStack Query, React Router |
| API | Hono en Cloudflare Workers (el mismo Worker sirve la app y `/api/*`) |
| Base de datos | Postgres en Neon + Drizzle ORM |
| Login | Cloudflare Access (Google o código al correo) + verificación del JWT y tabla de usuarios en el Worker |
| PDF | pdf-lib en el navegador |
| Respaldo | Google Sheets API con cuenta de servicio |
| Deploy | Cloudflare Workers Builds: cada push a `main` se publica solo |
| Pruebas | Vitest + PGlite (Postgres en memoria); CI en GitHub Actions |

## Empezar en una compu nueva

Requiere **Node 22.12 o más nuevo** (recomendado 24, ver `.nvmrc`; en Windows: `nvm install 24` y
`nvm use 24`; con Node 20 fallan wrangler y `npm run dev`) y acceso a la rama `dev` de Neon.

```bash
git clone <url-del-repo>
cd reconstructora-presupuestos
npm install
cp .env.example .env            # DATABASE_URL de la rama dev, SEED_USUARIOS con tu correo
cp .dev.vars.example .dev.vars  # la misma URL + DEV_AUTH_EMAIL con tu correo
npm run db:migrate              # crea/actualiza las tablas en dev
npm run db:seed-usuarios        # te registra como admin
npm run dev                     # http://localhost:5173
```

En local no hay login: `DEV_AUTH_EMAIL` dice quién eres. Para montar producción desde cero, ver
[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

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
| `npm run db:studio` | Explorador de la base (Drizzle Studio) |
| `npm run db:seed-usuarios` | Registra los usuarios de `SEED_USUARIOS` como activos |
| `npm run db:copia` / `db:copia:produccion` | Copia de toda la base a `../copias` (JSON) |
| `npm run db:restaurar -- <archivo> [--produccion]` | Reemplaza la base por una copia (pide escribir RESTAURAR) |
| `npm run configurar:produccion` | Primera vez: migra production, siembra usuarios y guarda la URL como secreto del Worker |
| `npm run configurar:google` | Respaldo en Sheets: lee la llave `.json` y el link del archivo y guarda los secretos |
| `npm run etl:parse` | Lee los Excel históricos (fuera del repo) y genera `../_etl/` |
| `npm run etl:load` / `etl:load:produccion` | Carga el histórico a dev / production |

## Publicar cambios

1. `npm run check:privacidad`, `npm run typecheck`, `npm test` y `npm run build`.
2. Si el cambio trae una **migración nueva** (carpeta `drizzle/`): `npm run db:migrate` y
   `npm run db:migrate:produccion` **antes** del push.
3. `git push` a `main`. Cloudflare compila y publica en uno o dos minutos.

Commits sin coautoría (sin `Co-Authored-By`); el autor es el dueño del repo.

## Configuración

| Dónde | Qué |
|---|---|
| `.env` (local, ignorado) | `DATABASE_URL` (dev), `SEED_USUARIOS`, `DATA_DIR`, `ETL_OUT_DIR`, `COPIAS_DIR` (opcional) |
| `.dev.vars` (local, ignorado) | `DATABASE_URL` (dev), `DEV_AUTH_EMAIL`; y los `GOOGLE_*` / `SHEETS_RESPALDO_ID` si se usa el respaldo en local |
| Secretos del Worker | `DATABASE_URL` (production), `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SHEETS_RESPALDO_ID` |
| `wrangler.jsonc` → `vars` | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (públicos) |
| Página **Ajustes** (admin) | Membrete del PDF (empresa, correo, teléfono, firma, lugar, nota), logo e íconos de redes. Se guarda en la base (una vez en dev y otra en production) |

## Estructura

```
src/client/   React: páginas, editor de presupuestos, PDF, búsqueda
src/worker/   API (Hono): rutas, login, respaldo en Sheets
src/db/       Esquema de la base, estadísticas, copia y restauración
src/shared/   Código común: dinero, fechas, claves, cálculos, PDF
scripts/      ETL del histórico, configuración de producción, copias, privacidad
drizzle/      Migraciones SQL
docs/         Documentación
```

Más detalle en [docs/DESARROLLO.md](docs/DESARROLLO.md#estructura).

## Histórico (Excel → base)

Los Excel viven fuera del repo. `npm run etl:parse` genera en `../_etl/` el `historico.json`, un
`revision.md` para revisar a mano y un `estadisticas.md`; las correcciones van en `../overrides.json`.
Después, `npm run etl:load`. Una vez que se empieza a trabajar en la app publicada, **no volver a
cargar el histórico en production**. Todo en [docs/ETL.md](docs/ETL.md).
