# CLAUDE.md — reconstructora-presupuestos

Léelo completo al empezar cada conversación. **Actualízalo** cuando cambie algo
importante (decisiones, estado de fases, comandos, convenciones).

## Qué es

App web para crear, gestionar y respaldar los presupuestos de un taller familiar
de reconstrucción de buses. Reemplaza el flujo actual (copiar una pestaña de
Excel y editarla a mano) y da estadísticas de todo el histórico.

Usuarios: todos tienen los **mismos permisos** (rol `usuario`), salvo el **admin**
(dueño del repo), que además autoriza o niega el acceso. Quien entra por primera vez
queda `pendiente` en la tabla `usuarios` hasta que el admin lo aprueba en la página
**Usuarios** (`/usuarios`, API `/api/usuarios`).

Flujo real del negocio: la persona que arma el presupuesto lo deja `listo`, genera el
**PDF** y se lo pasa al jefe, que lo revisa y lo manda al cliente **fuera de la app**.
Estados del presupuesto: `borrador` → `listo`. Un **trabajo** agrupa el presupuesto
original y sus **extras** ("EXTRAS", "OTRAS EXTRAS"… = el mismo trabajo con cosas
agregadas). Estado del trabajo: `cotizado`, `en_curso`, `terminado`, `no_concretado`.
Todo el histórico entra como `terminado` y sus presupuestos como `listo`.

## Reglas que no se rompen

1. **El repo es público. Nunca se suben datos del negocio**: ni Excel, ni CSV, ni
   PDFs, ni montos, ni nombres de clientes, ni correos, ni `historico.json`, ni
   `overrides.json`. Este archivo tampoco lleva ese tipo de datos. Si hace falta
   anotar algo sensible, va en `CLAUDE.local.md` (ignorado por git).
2. **Secretos** solo en `.env` / `.dev.vars` (locales, ignorados) y en secretos de
   Cloudflare (`wrangler secret put`). Nunca en `wrangler.jsonc` ni en el código. (En `vars` de
   `wrangler.jsonc` solo van valores públicos; ojo: `wrangler deploy` borra las variables de texto
   creadas en el dashboard, por eso viven en el archivo. Los secretos sí se conservan.)
3. `npm run check:privacidad` debe pasar antes de cada commit (también corre en CI).
4. **Commits sin coautoría**: nada de `Co-Authored-By` ni `Claude-Session`. Autor:
   el dueño del repo. Solo se commitea cuando el paso funciona (typecheck + tests + build).
5. Datos de prueba en tests: siempre inventados.
6. Código, nombres de tablas y UI en español.

## Stack

| Parte | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 + TypeScript + Tailwind 4 + TanStack Query + React Router |
| API | Hono en Cloudflare Workers (mismo Worker sirve el SPA y `/api/*`) |
| Base de datos | Postgres en Neon (plan gratis) + Drizzle ORM (driver HTTP `neon-http` en el Worker, `postgres-js` en scripts) |
| Login | Cloudflare Access delante de la app (cualquier correo puede identificarse); el Worker verifica el JWT (`Cf-Access-Jwt-Assertion`) y solo deja pasar correos `activo` en `usuarios`. En local, `DEV_AUTH_EMAIL` en `.dev.vars`. |
| Respaldo | Google Sheets API con cuenta de servicio: una pestaña por presupuesto, copiando la plantilla con el formato de siempre (fase 5) |
| Deploy | Cloudflare Workers Builds conectado a GitHub: push a `main` → build → deploy |
| Tests | Vitest; PGlite para probar migraciones y carga sin Postgres real |

Sin Docker: Workers no corre contenedores y en local basta `vite` + rama `dev` de Neon.

## Estructura

```
src/
  client/      React (páginas en client/pages, componentes en client/components)
  worker/      Hono: index.ts (rutas), middleware/auth.ts, db.ts, env.ts
  db/schema.ts Esquema Drizzle (fuente de verdad de la base)
  shared/      Utilidades usadas por app y scripts (dinero, fechas, texto) + tests
scripts/
  etl/         Migración de los Excel históricos (ver abajo)
  seed-usuarios.ts, check-privacidad.mjs
drizzle/       Migraciones SQL generadas (sí se suben)
docs/          PLAN.md (fases), DESPLIEGUE.md (cuentas y deploy)
```

## Comandos

Requiere **Node 22.12+** (en Windows se usa nvm: `nvm use 24`) (recomendado 24, ver `.nvmrc`; `.npmrc` tiene `engine-strict`). Con Node 20 fallan wrangler/miniflare y `npm run dev`.

```bash
npm run dev               # app local (Vite + Worker en workerd) — usa .dev.vars
npm run typecheck         # tsc -b (app, worker y scripts)
npm test                  # vitest
npm run build             # build de producción (dist/)
npm run check:privacidad  # nada sensible trackeado
npm run db:generate       # nueva migración desde src/db/schema.ts
npm run db:migrate        # aplicar migraciones a DATABASE_URL (.env)
npm run db:seed-usuarios  # usuarios desde SEED_USUARIOS (.env)
npm run etl:parse         # Excel → ../_etl/{historico.json,revision.md,estadisticas.md}
npm run etl:load          # historico.json → base (idempotente)
npm run configurar:produccion  # pide la URL de production: migra, siembra y la guarda como secreto del Worker
```

## ETL del histórico (fase 1)

- Fuentes (fuera del repo, en `DATA_DIR`, por defecto la carpeta padre):
  `PRESUPUESTO.xlsx` (una pestaña por presupuesto, precio en col. D) y
  `PRESUPUESTOS VIEJITOS.xlsx` (una hoja con bloques que empiezan en "Lugar y Fecha",
  precios como texto `Q.8,000,-` en col. J o E).
- Salida en `ETL_OUT_DIR` (por defecto `../_etl`; el script se niega a escribir dentro del repo).
- Reglas principales (`scripts/etl/lineas.ts`, `agrupar.ts`):
  - Sección = línea en MAYÚSCULAS sin precio. `RESUMEN/RESUMIENDO/TOTALES` se ignoran;
    `ANTICIPOS` se guarda como anticipo; `CERRADO EN` = precio negociado.
  - Sub-items (`*`, `a. b. c.`) sin precio propio = detalle del item de arriba, no suman.
    Con precio en la columna de precios sí cuentan (así suma el Excel).
  - Cada `TOTAL` se valida contra la suma de items de arriba; las diferencias van a `revision.md`.
  - Pestañas del mismo cliente y misma fecha se unen (eran un presupuesto partido por el límite de 35 filas).
  - Nombre con EXTRA/OTRAS/ACCESORIOS/ARREGLO → extra del último trabajo del cliente.
    Sin marca pero ≤31 días y mismo bus → extra inferido (se reporta).
  - Mismo cliente + misma fecha + ≥50% items iguales → versión repetida, se usa la última.
  - Clientes: se unen solo si su clave normalizada es idéntica; parecidos se **sugieren**.
  - Bus = placa si hay; si no, nombre del bus dentro del cliente. Casi ningún histórico tiene placa.
  - Productos: clave normalizada + agrupación por similitud ≥0.88; entran al catálogo si aparecen 2+ veces.
- Correcciones manuales en `DATA_DIR/overrides.json` (ver ejemplo al final de `revision.md`).

## Estado de fases

Ver `docs/PLAN.md`. Actual:

- [x] Fase 0 — Base: estructura, Worker + SPA, auth con solicitudes de acceso, página Usuarios, CI, privacidad
- [x] Fase 1 — Esquema + ETL (parse, reporte, carga probada con PGlite)
- [x] Neon: proyecto con ramas `production` (app publicada) y `dev` (local, sin auto-borrado). `dev` ya migrada.
- [x] Cloudflare Workers Builds conectado al repo: push a `main` → deploy en `*.workers.dev`.
- [x] Producción: secreto `DATABASE_URL`, tablas migradas, admin sembrado (`npm run configurar:produccion`).
- [x] Zero Trust Free (equipo `cold-math-81b4`). Access aplicado al Worker (todo el tráfico) con la política
  reusable "Cualquier correo verificado (la app autoriza)" = Everyone, sesión de 1 mes. Login por PIN al correo.
  `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` van en `wrangler.jsonc` → `vars` (no son secretos).
- [ ] Cargar histórico revisado a producción; Google Cloud (fase 5).
  Notas: el navegador integrado no pasa la verificación anti-bots de los registros; el entorno de Claude
  no llega a las APIs de Neon/Cloudflare; Claude no escribe contraseñas en formularios (las pega el dueño).
- [ ] Fase 2 — Estadísticas en la app
- [ ] Fase 3 — CRUD clientes / buses / productos
- [ ] Fase 4 — Editor de presupuestos + PDF
- [ ] Fase 5 — Respaldo en Google Sheets con el formato de siempre
- [ ] Fase 6 — Pulido

## Decisiones (más reciente arriba)

- 2026-10-06 — Roles simplificados: `admin` (autoriza/niega acceso) y `usuario` (todo lo demás,
  todos iguales). Sin rol revisor: el jefe revisa el PDF fuera de la app. Estados del
  presupuesto: `borrador`/`listo`. Acceso por solicitud: Access identifica, la app autoriza.

- 2026-10-06 — Hosting en Cloudflare Workers (gratis, permite uso comercial, no se duerme).
  Vercel Hobby descartado (prohíbe uso comercial); Render gratis se duerme; Supabase gratis
  pausa por inactividad; Netlify gratis cobra créditos por deploy.
- 2026-10-06 — Respaldo en Sheets vive en el Drive del admin; se escriben pestañas
  dentro de un archivo existente (las cuentas de servicio no tienen cuota de Drive para crear archivos).
- 2026-10-06 — El PDF es el entregable: se le pasa al jefe, que lo revisa y lo manda al cliente.
