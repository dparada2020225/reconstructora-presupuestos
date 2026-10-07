# Guía de desarrollo

Para quien va a cambiar el código. Cómo está armado por dentro: [ARQUITECTURA.md](ARQUITECTURA.md).

## Reglas del repo (no se rompen)

1. **El repo es público. Nunca se suben datos del negocio**: Excel, CSV, PDFs, montos, nombres de
   clientes, correos, `historico.json`, `overrides.json`, copias de la base. Los datos de prueba
   son siempre **inventados**.
2. **Secretos** solo en `.env` / `.dev.vars` (ignorados) y en secretos de Cloudflare. Nunca en el
   código ni en `wrangler.jsonc` (ahí solo valores públicos).
3. `npm run check:privacidad` antes de cada commit (también corre en CI y falla si hay algo prohibido).
4. **Commits sin coautoría** (sin `Co-Authored-By` ni `Claude-Session`); autor: el dueño del repo.
   Solo se commitea lo que pasa typecheck + tests + build.
5. Código, nombres de tablas y UI **en español**.

## Preparar la compu

- **Node 22.12 o más nuevo** (recomendado 24, ver `.nvmrc`; `.npmrc` tiene `engine-strict`).
  En Windows con nvm: `nvm install 24` y `nvm use 24`.
- Acceso a la rama `dev` de Neon.

```bash
git clone <url-del-repo>
cd reconstructora-presupuestos
npm install
cp .env.example .env            # DATABASE_URL (rama dev), SEED_USUARIOS, DATA_DIR, ETL_OUT_DIR
cp .dev.vars.example .dev.vars  # DATABASE_URL (rama dev) + DEV_AUTH_EMAIL (tu correo)
npm run db:migrate
npm run db:seed-usuarios
npm run dev                     # http://localhost:5173
```

En local no hay login: `DEV_AUTH_EMAIL` dice quién eres. Para el respaldo en Sheets en local,
`npm run configurar:google` también escribe en `.dev.vars`.

## Variables

| Variable | Dónde | Para qué |
|---|---|---|
| `DATABASE_URL` | `.env` (scripts), `.dev.vars` (app local), secreto del Worker (production) | Conexión a Postgres. |
| `DEV_AUTH_EMAIL` | `.dev.vars` | Usuario simulado en local. **Nunca** en producción. |
| `SEED_USUARIOS` | `.env` | `correo:rol:Nombre;…` para `db:seed-usuarios`. |
| `DATA_DIR`, `ETL_OUT_DIR` | `.env` | Carpeta de los Excel y salida del ETL (fuera del repo). |
| `COPIAS_DIR` | `.env` (opcional) | Dónde deja `db:copia` las copias (por defecto `../copias`). |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | `wrangler.jsonc` → `vars` | Verificar el JWT de Cloudflare Access. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SHEETS_RESPALDO_ID` | Secretos del Worker y `.dev.vars` | Respaldo en Sheets (`npm run configurar:google`). |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App local (Vite + Worker en workerd) con `.dev.vars`. |
| `npm run typecheck` | `tsc -b` de app, worker y scripts. |
| `npm test` | Vitest (todas las pruebas). `npx vitest run ruta/archivo.test.ts` para una sola. |
| `npm run build` | Build de producción en `dist/`. |
| `npm run check:privacidad` | Revisa que nada sensible esté en git. |
| `npm run db:generate` | Migración nueva a partir de `src/db/schema.ts`. |
| `npm run db:migrate` / `db:migrate:produccion` | Aplica migraciones a dev / production (pide la URL). |
| `npm run db:studio` | Drizzle Studio (explorador de la base de `.env`). |
| `npm run db:seed-usuarios` | Siembra usuarios de `SEED_USUARIOS`. |
| `npm run db:copia` / `db:copia:produccion` | Copia de toda la base a `../copias`. |
| `npm run db:restaurar -- <archivo> [--produccion]` | Reemplaza la base por una copia. |
| `npm run etl:parse` / `etl:load` / `etl:load:produccion` | Histórico ([ETL.md](ETL.md)). |
| `npm run configurar:produccion` | Primera vez: migra, siembra y guarda `DATABASE_URL` de production como secreto. |
| `npm run configurar:google` | Llave de la cuenta de servicio + link del Sheets → `.dev.vars` y secretos. |
| `npm run cf-typegen` | Tipos de los bindings de Wrangler. |

## Estructura

```
src/
  client/            React
    main.tsx         rutas
    api.ts           api()/enviar() y tipos de las respuestas
    busqueda.ts      búsqueda global (pura, con test)
    components/      Layout, ui (botones, campos, diálogos…), gráficas, búsqueda, copia de la base, unir, trabajos
    editor/          editor de presupuestos (modelo.ts, Editor.tsx, CampoDescripcion, EstadoPagos, Respaldo)
    pages/           una por ruta
    pdf/             botones de PDF (ver, descargar, compartir, unificado)
  worker/
    index.ts         entrada del Worker
    app.ts           crearApp(obtenerDb): Hono, errores, rutas
    routes/*.ts      una por recurso (+ comun.ts)
    middleware/auth  Access + tabla usuarios
    respaldo.ts      Google Sheets
    *.test.ts        pruebas de la API con PGlite
  db/
    schema.ts        esquema (fuente de verdad)
    tipos.ts         Db, enLote, reservarIds
    estadisticas.ts  consultas de Estadísticas
    copia-base.ts    copia y restauración
  shared/            funciones puras para cliente, worker y scripts (+ tests)
scripts/             ETL, migración/configuración de production, copias, privacidad
drizzle/             migraciones SQL (sí se suben)
docs/                documentación
```

## Cómo agregar algo (receta)

1. **Base** (si hace falta): cambiar `src/db/schema.ts` → `npm run db:generate` (ver abajo).
2. **Lógica pura** en `src/shared/` con su test si se usa en más de un lado o tiene cálculo.
3. **API**: ruta en `src/worker/routes/<recurso>.ts` con validación zod (mensajes en español) y
   montarla en `app.ts` si es nueva. Prueba en `src/worker/*.test.ts` con PGlite usando `crearApp`.
4. **Cliente**: tipo de la respuesta en `api.ts`, `useQuery`/`useMutation` con la misma `queryKey`
   que el resto (invalidar lo que cambie), componentes de `components/ui.tsx`.
5. Si cambia algo importante, **actualizar** `CLAUDE.md` y la doc que corresponda.
6. `check:privacidad`, `typecheck`, `test`, `build` → commit → (migrar production si aplica) → push.

## Cambiar la base de datos

```bash
# 1. editar src/db/schema.ts
npm run db:generate     # crea drizzle/000N_nombre.sql
# 2. revisar el SQL: si hay datos que mover o columnas NOT NULL nuevas, editarlo a mano
npm run db:migrate      # dev
npm test                # las pruebas aplican todas las migraciones en PGlite
```

- **Renombres**: drizzle-kit pregunta en la terminal si es una columna nueva o renombrada y necesita
  una terminal interactiva. Si no la hay (CI, scripts): `script -qfc "npx drizzle-kit generate" /dev/null`
  mandando Enter (= columna nueva) y después editar el SQL para pasar los datos.
- Si una migración se edita a mano para mover datos, agregar una prueba en `src/db/migracion.test.ts`
  con datos en el formato viejo.
- Production se migra **antes** del push (`npm run db:migrate:produccion`).

## Trampas conocidas

- **Builders de Drizzle son "thenables"**: una función `async` que devuelve un builder lo **ejecuta**
  al hacer `await`. Para mandarlo a `enLote`, devolverlo envuelto (`{ consulta }`).
- **Subconsultas en SQL crudo**: usar nombres calificados (`presupuestos.id`), no columnas sueltas, o
  Postgres se queja de ambigüedad o compara la columna equivocada.
- **Dinero** viene como texto de Postgres: `Number(...)` siempre.
- **neon-http** no tiene transacciones interactivas: `enLote` (batch). `db.transaction` solo en
  scripts (postgres-js) y pruebas (PGlite).
- **CPU del Worker**: nada pesado en el servidor (ver ARQUITECTURA). Listas completas y cálculos de
  similitud van en el navegador.
- URLs de Neon traen `channel_binding=require`, que postgres-js no entiende: los scripts lo quitan
  con `urlParaScripts` (`scripts/db-url.ts`).
- Fórmulas que se escriben en Sheets: sin `,` ni `;` (dependen del idioma del archivo).
- `window.open` para "Ver PDF" tiene que llamarse **en el clic** (antes de cualquier `await`) o el
  navegador lo bloquea. Lo mismo `navigator.share` (por eso existe el botón "Toca para compartir").

## Pruebas

- `npm test` corre todo; las de la API levantan PGlite y aplican las migraciones reales.
- Los datos de prueba son **inventados** (nombres tipo "Cliente Inventado", correos `@ejemplo.com`).
- Para probar contra un Postgres de verdad (por ejemplo, scripts con postgres-js), se puede usar una
  rama de Neon o un Postgres local y pasar `DATABASE_URL=… npm run …`.

## Estilo

- TypeScript estricto; funciones y variables en español (`crearApp`, `presupuestos`, `guardar`).
- Comentarios breves que expliquen el **porqué**.
- UI: textos cortos y claros, en español de Guatemala; botones con verbo ("Guardar", "Descargar PDF").
- Errores de la API con mensajes que entienda quien usa la app (se muestran tal cual).
