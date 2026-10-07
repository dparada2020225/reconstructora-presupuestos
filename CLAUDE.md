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

Flujo real del negocio: la persona que arma el presupuesto genera el **PDF** y se lo pasa
al jefe, que lo revisa y lo manda al cliente **fuera de la app**.
Estados de cada presupuesto (original o extra): `borrador` → `cotizacion` → `en_curso` →
`terminado`, o `cancelado`. Un **trabajo** agrupa el presupuesto original y sus **extras**
("EXTRAS", "OTRAS EXTRAS"… = el mismo trabajo con cosas agregadas). El estado del trabajo
(`cotizado`, `en_curso`, `terminado`, `no_concretado`) **se calcula** de sus presupuestos
(`estadoDelTrabajo` en `src/shared/estados.ts`), no se edita. **Abonos** (tabla `pagos`,
forma efectivo/cheque/transferencia) por presupuesto: su suma = `presupuestos.anticipo`
(lo único de los abonos que sale en el PDF). Todo el histórico entra como `terminado`.

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
  worker/      Hono: app.ts (crearApp: rutas y errores; recibe la base → se prueba con PGlite en api.test.ts),
               index.ts (entrada del Worker), routes/*.ts, middleware/auth.ts, db.ts, env.ts
  db/schema.ts Esquema Drizzle (fuente de verdad de la base)
  db/estadisticas.ts  Consultas de la página Estadísticas
  db/tipos.ts  Tipo `Db` común a los drivers + `enLote` (batch atómico en neon-http; en orden en tests)
  shared/      Utilidades usadas por app y scripts (dinero, fechas, texto, claves, categorías, estadísticas) + tests
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
npm run db:migrate:produccion  # pide la URL de production y la migra (ANTES del push que trae la migración)
npm run db:seed-usuarios  # usuarios desde SEED_USUARIOS (.env)
npm run etl:parse         # Excel → ../_etl/{historico.json,revision.md,estadisticas.md}
npm run etl:load          # historico.json → base de .env (idempotente)
npm run etl:load:produccion  # igual, pero pide la URL de la rama production
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
- [ ] Cargar histórico revisado a producción (`etl:load:produccion`); Google Cloud (fase 5).
- [x] Login con Google en Access: proyecto GCP `reconstructora-presupuestos`, cliente OAuth "Cloudflare Access"
  (redirect `https://<equipo>.cloudflareaccess.com/cdn-cgi/access/callback`). Hay que tener la app publicada (no en prueba).
  `overrides.json` (fuera del repo) ya une 3 pares de clientes duplicados confirmados por el dueño.
  Notas: el navegador integrado no pasa la verificación anti-bots de los registros; el entorno de Claude
  no llega a las APIs de Neon/Cloudflare; Claude no escribe contraseñas en formularios (las pega el dueño).
- [x] Fase 2 — Estadísticas en la app (`/estadisticas`, API `/api/estadisticas?desde=AAAA&hasta=AAAA`).
  Consultas en `src/db/estadisticas.ts` (driver-agnóstico, probado con PGlite), cálculos puros en
  `src/shared/estadisticas.ts`, gráficas SVG propias en `src/client/components/graficas.tsx`
  (una serie, azul #2a78d6, tooltip, "Ver como tabla"). Categoría = sección del presupuesto.
  Los productos repetidos del catálogo se unen desde la página Productos (fase 3).
- [x] Fase 3 — Clientes, buses y productos: listas con búsqueda (sin tildes, en el navegador), detalle
  editable, crear, borrar (bloqueado si tiene trabajos/usos → se une o se desactiva), **unir** repetidos
  (`POST /api/{clientes|buses|productos}/:id/unir {otroId}`: el otro se une dentro de :id y se borra) y
  panel de **posibles repetidos** (clientes y productos; se calcula en el navegador con
  `posiblesDuplicados` de `shared/claves.ts`; "No son el mismo" se guarda en `duplicados_descartados`).
  Producto: historial de precios (usos + mediana por año), precio de referencia, desactivar.
- [x] Fase 4 — Editor de presupuestos + PDF:
  - [x] 4.1 API: `/api/presupuestos` (GET lista, GET :id con items/trabajo/hermanos, POST = trabajo nuevo
    con `clienteId` o EXTRA con `trabajoId`, PUT :id reemplaza encabezado + líneas, PATCH :id/estado,
    DELETE :id solo borradores), `/api/trabajos/:id` (GET, PATCH estado/título/notas) y
    `/api/configuracion` (membrete del PDF; GET todos, PUT admin). Forma del cuerpo en
    `src/shared/presupuesto.ts` (`PresupuestoEntrada`, `LineaEntrada` con `detalles` = sub-items sin precio).
    Ids reservados con `reservarIds` → todo se guarda en un solo `enLote`. Líneas sin producto se enlazan
    al catálogo por alias. Migración 0002 (`configuracion`).
  - [x] 4.2 Pantallas: /presupuestos (lista), /trabajos/:id (estado, notas, + extra), /presupuestos/nuevo
    (?trabajo=ID extra, ?base=ID copiar líneas, ?cliente=ID), /presupuestos/:id (editor), /ajustes (membrete
    y logo, admin), Inicio con "Nuevo presupuesto" y borradores. Editor en `src/client/editor/`
    (`modelo.ts` = estado ↔ API; `Editor.tsx`; `CampoDescripcion.tsx` = autocompletar del catálogo con
    precio de referencia o último). Enter = línea nueva, Ctrl+S guarda, aviso al salir con cambios.
  - [x] 4.3 PDF en el navegador (`src/shared/pdf-presupuesto.ts`, pdf-lib en chunk aparte; botones
    "Ver PDF"/"Descargar PDF" en `src/client/pdf/AccionesPdf.tsx`, guardan antes si hay cambios) con el formato del Excel: logo, lugar y fecha,
    cliente, placa/transporte, a la derecha correo/empresa/tel; secciones centradas en negrita, líneas
    "- descripción……… Q4,500.00", TOTAL por sección con fondo verde #8CDA1F, resumen si hay varias
    secciones (secciones repetidas se suman), "CERRADO EN", anticipo/saldo, en extras "RESUMEN DEL TRABAJO",
    NOTA centrada y firma en negrita; "c/u" solo si el precio por unidad es exacto; páginas numeradas si
    son varias. Datos del membrete salen de `configuracion` (página Ajustes; el admin los llena una vez
    por base, dev y production).
- [x] Extras antes de la fase 5: logo centrado y línea verde en el PDF; 5 estados por presupuesto
  (migración 0003, editada a mano: 'listo' → estado de su trabajo; anticipos → abonos); abonos con aro
  de % en el editor (`src/client/editor/EstadoPagos.tsx`, API `POST/DELETE /api/presupuestos/:id/pagos`);
  documento unificado del trabajo (`generarPdfTrabajo`: original + extras + resumen, botón bajo
  "Total del trabajo" y en /trabajos/:id). Estadísticas excluyen borradores y cancelados; los cancelados
  no suman al trabajo.
- [ ] Fase 5 — Respaldo en Google Sheets con el formato de siempre
- [ ] Fase 6 — Pulido

## Decisiones (más reciente arriba)

- 2026-10-06 — Estado por presupuesto (5 estados) en vez de borrador/listo + estado del trabajo
  editable; el del trabajo se deriva. El anticipo ya no se escribe a mano: es la suma de los abonos
  (PUT del presupuesto no lo toca). Ojo: una función `async` que devuelve un builder de Drizzle lo
  EJECUTA al hacer await (es thenable): para mandarlo a `enLote`, devolverlo envuelto en un objeto.

- 2026-10-06 — Fase 4. El PDF se genera en el navegador (no en el Worker: ~10 ms de CPU). El membrete
  (correo, teléfono, firma, logo) vive en la tabla `configuracion`, no en el repo. Guardar un presupuesto
  reemplaza todas sus líneas en un solo `enLote` con ids reservados (`reservarIds`). Los documentos de un
  trabajo se ordenan por `numero` (original 0, extras 1, 2…), no por fecha.

- 2026-10-06 — Fase 3. Varias escrituras juntas van con `enLote` (neon-http no tiene transacciones
  interactivas; `batch` sí es todo o nada). Workers gratis tiene ~10 ms de CPU por petición: cálculos
  pesados (posibles repetidos, ~400 productos) se hacen en el navegador, no en el Worker. Un producto
  usado no se borra (perdería el historial): se desactiva o se une. `etl:load` reconoce productos por
  alias para respetar uniones hechas en la app; aun así, no volver a correrlo en producción.

- 2026-10-06 — Roles simplificados: `admin` (autoriza/niega acceso) y `usuario` (todo lo demás,
  todos iguales). Sin rol revisor: el jefe revisa el PDF fuera de la app. Estados del
  presupuesto: `borrador`/`listo`. Acceso por solicitud: Access identifica, la app autoriza.

- 2026-10-06 — Hosting en Cloudflare Workers (gratis, permite uso comercial, no se duerme).
  Vercel Hobby descartado (prohíbe uso comercial); Render gratis se duerme; Supabase gratis
  pausa por inactividad; Netlify gratis cobra créditos por deploy.
- 2026-10-06 — Respaldo en Sheets vive en el Drive del admin; se escriben pestañas
  dentro de un archivo existente (las cuentas de servicio no tienen cuota de Drive para crear archivos).
- 2026-10-06 — El PDF es el entregable: se le pasa al jefe, que lo revisa y lo manda al cliente.
