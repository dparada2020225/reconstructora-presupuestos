# Arquitectura

Cómo está hecha la app por dentro y por qué. Para usarla, ver [MANUAL.md](MANUAL.md); para la
lista de endpoints, [API.md](API.md); para las tablas, [BASE-DE-DATOS.md](BASE-DE-DATOS.md).

## Vista general

```
 Navegador (React SPA)                         Cloudflare
 ┌──────────────────────────┐    HTTPS    ┌──────────────────────────────────────────┐
 │ páginas, editor, gráficas│ ──────────▶ │ Access (login: Google o PIN al correo)   │
 │ PDF con pdf-lib          │             │   └▶ agrega JWT Cf-Access-Jwt-Assertion  │
 │ búsqueda (en memoria)    │ ◀────────── │ Worker "reconstructora-presupuestos"     │
 │ copia de la base (arma   │   JSON      │   ├ /api/*  → Hono (verifica JWT, usuario)│
 │ el JSON por páginas)     │             │   └ lo demás → archivos del SPA (dist)   │
 └──────────────────────────┘             └───────┬───────────────────┬──────────────┘
                                                  │ HTTP (neon-http)  │ HTTPS (cuenta de servicio)
                                          ┌───────▼───────┐   ┌───────▼────────────────┐
                                          │ Neon Postgres │   │ Google Sheets API      │
                                          │ production/dev│   │ "Respaldo presupuestos"│
                                          └───────────────┘   └────────────────────────┘
```

- **Un solo Worker** sirve la SPA (assets estáticos de `dist/client`) y la API (`/api/*`, con
  `run_worker_first`). `not_found_handling: single-page-application` hace que cualquier ruta del
  cliente devuelva `index.html`.
- **Deploy**: Cloudflare Workers Builds está conectado a GitHub; cada push a `main` corre
  `npm run build` y `wrangler deploy`. CI de GitHub corre privacidad, typecheck, tests y build.
- **Costo**: todo en planes gratis (Workers, Access hasta 50 usuarios, Neon, Google Cloud).

## Restricción que manda en el diseño: ~10 ms de CPU por petición

El plan gratis de Workers da muy poca CPU por petición. Por eso:

| Trabajo pesado | Dónde corre |
|---|---|
| Generar PDF (pdf-lib) | Navegador (chunk aparte, se carga la primera vez) |
| Posibles repetidos (~400 productos, similitud de textos) | Navegador |
| Búsqueda global | Navegador, sobre las listas ya cargadas |
| Copia de toda la base | El navegador pide cada tabla de a 1000 filas y arma el JSON |
| Estadísticas | Consultas SQL agregadas en Postgres; el Worker solo arma la respuesta |
| Respaldo en Sheets | `waitUntil` (después de responder); casi todo es espera de red, no CPU |

## Autenticación y permisos

1. **Cloudflare Access** protege todo el Worker. Su política deja pasar a *cualquier* correo
   verificado (Google o PIN): Access solo **identifica**.
2. El Worker (`src/worker/middleware/auth.ts`) verifica el JWT de Access contra las llaves públicas
   del equipo (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) y saca el correo.
3. La app **autoriza**: busca el correo en `usuarios`.
   - No existe → lo crea como `pendiente` y responde 403 `pendiente`.
   - `pendiente` o `denegado` → 403 con ese estado (la SPA muestra el aviso).
   - `activo` → sigue, con `c.var.usuario`.
4. Roles: `usuario` (todo) y `admin` (además Usuarios, Ajustes del membrete, respaldo "rehacer"
   y copia de la base). `requiereRol("admin")` protege esas rutas.
5. En local no hay Access: `DEV_AUTH_EMAIL` en `.dev.vars` hace de usuario logueado.

`/api/health` es la única ruta pública (prueba la base con `select 1`).

## Cliente (src/client)

- **React 19 + React Router** (`main.tsx` define las rutas) y **TanStack Query** para todo lo que
  viene de la API (`api.ts`: `api()` para GET, `enviar()` para escribir; errores como `ApiError`).
- Las listas (`presupuestos`, `clientes`, `buses`, `productos`) se piden **completas** una vez y se
  filtran en el navegador (son cientos, no millones). La búsqueda global reusa esas mismas
  consultas y su caché.
- **Editor** (`src/client/editor/`): `modelo.ts` convierte entre el estado del editor (secciones →
  líneas → detalles, con `key` locales) y el cuerpo de la API (`PresupuestoEntrada`). Guardar manda
  el presupuesto completo (PUT) y el servidor reemplaza todas sus líneas.
- **Componentes comunes** en `components/ui.tsx` (Boton, Campo, Caja, Dialogo con `<dialog>`,
  Confirmar, ComboBusqueda, Aro, `coincide` para búsquedas sin tildes).
- **Gráficas** SVG propias (`components/graficas.tsx`), una serie, con "Ver como tabla".
- Estilos con Tailwind 4; colores de marca en `index.css` (`--color-marca-*`, `--color-acento`).

## API (src/worker)

- `app.ts` → `crearApp(obtenerDb)`: arma Hono con `basePath("/api")`, inyecta la base por
  petición, aplica `requiereUsuario` y monta las rutas de `routes/*.ts`. Recibir la base como
  función permite probar la API completa con **PGlite** (`app.request(...)`) sin servidor.
- Validación con **zod**; los errores de zod salen como 400 con los mensajes en español, los
  `HTTPException` con su código, y un índice único violado (`23505`) como 409.
- `index.ts` es la entrada del Worker: `crearApp((env) => crearDb(env.DATABASE_URL))` (base con
  `neon-http`, `src/worker/db.ts`). Los archivos del SPA los sirve la plataforma (assets), no el código.

## Base de datos

- Postgres en **Neon**: rama `production` (la app publicada) y rama `dev` (local).
- **Drizzle ORM**. `src/db/schema.ts` es la fuente de verdad; `npm run db:generate` crea la
  migración SQL en `drizzle/`. Drivers: `neon-http` en el Worker, `postgres-js` en scripts, PGlite en
  pruebas. El tipo común es `Db` (`src/db/tipos.ts`).
- `neon-http` **no tiene transacciones interactivas** pero sí `batch` (todo o nada). Por eso las
  escrituras múltiples van con `enLote(db, consultas)`; los ids que se necesitan de antemano
  (trabajo → presupuesto → items → sub-items) se reservan con `reservarIds` (`nextval`).
- Dinero: `numeric(12,2)` (Drizzle lo devuelve como texto; se convierte con `Number`).

Detalle de tablas en [BASE-DE-DATOS.md](BASE-DE-DATOS.md).

## Flujos principales

### Guardar un presupuesto
1. El editor arma `PresupuestoEntrada` (encabezado + líneas con `detalles`).
2. `POST /api/presupuestos` (nuevo: trabajo nuevo con `clienteId`, o extra con `trabajoId`) o
   `PUT /api/presupuestos/:id`.
3. El servidor valida, recalcula precios y total, enlaza cada línea al catálogo (por `productoId` o
   por alias normalizado de la descripción) y en un solo `enLote`: borra las líneas viejas, inserta
   las nuevas (padres y sub-items con ids reservados) y actualiza el encabezado.
4. Si el presupuesto no es borrador y fue creado en la app, se dispara el respaldo en Sheets en
   segundo plano.

### Estados
- Cada presupuesto tiene su estado (`PATCH /:id/estado`).
- El del trabajo se **deriva** con `estadoDelTrabajo` (`src/shared/estados.ts`) y se guarda en
  `trabajos.estado` en el mismo lote (`sincronizarTrabajo`). Al pasar a terminado se anota `fecha_fin`.
- Totales del trabajo (`montoTrabajo`): suma de presupuestos no cancelados; si alguno tiene
  "cerrado en", ese monto reemplaza lo cotizado hasta ese documento (los extras posteriores se suman).

### PDF
- `src/shared/pdf-presupuesto.ts` (compartido, probado en Node): `generarPdf` (un presupuesto) y
  `generarPdfTrabajo` (documento unificado). Clase `Lienzo` para escribir línea por línea con salto
  de página, puntos de relleno, TOTAL en verde `#8CDA1F`, numeración de páginas.
- El membrete (empresa, correo, teléfono, firma, nota, lugar, logo, íconos) sale de `configuracion`.
- Las fuentes estándar de PDF no tienen todos los caracteres: `Lienzo.limpio()` cambia las comillas
  tipográficas por `"` y lo que no se puede dibujar (emojis…) por `?`.
- `AccionesPdf.tsx`: Ver (pestaña abierta en el mismo clic para que no la bloqueen), Descargar y
  Compartir (Web Share API con archivo; si se pierde el "clic reciente", queda un botón para
  compartir con un clic más).

### Respaldo en Google Sheets
- `src/worker/respaldo.ts`. Token de la cuenta de servicio: JWT RS256 firmado con `jose`,
  cambiado en `oauth2.googleapis.com/token` y guardado en memoria ~1 hora.
- Por presupuesto: borra su pestaña anterior (gid en `sheet_url`), **duplica la pestaña FORMATO**,
  inserta filas si no caben, escribe valores (`USER_ENTERED`) y formatos (títulos centrados, TOTAL
  verde). Las posiciones se detectan leyendo la plantilla (`detectarPosiciones`).
- Los TOTAL son fórmulas `=SUM(Da:Db)+…` **sin comas ni punto y coma**: el separador de argumentos
  depende del idioma del archivo (en español es `;`).
- Si falla, el presupuesto queda guardado igual, con `respaldo_error`; los pendientes
  (`respaldado_en < actualizado_en`) se copian desde Ajustes de a 5.
- Los renglones salen de `src/shared/respaldo.ts` (mismo orden que el PDF).

### Copia de toda la base
- `src/db/copia-base.ts`: tablas en orden de dependencias; exporta con `row_to_json` (formato de
  Postgres, igual con cualquier driver) en páginas de 1000.
- Restaurar (`restaurarBase`, solo scripts): verifica que sea una copia de esta app con las mismas
  migraciones, y en una transacción: `truncate … restart identity cascade`, inserta con
  `json_populate_recordset`, completa `parent_id` de los sub-items al final y ajusta las secuencias.

### Histórico (ETL)
Los Excel viejos se convierten con `scripts/etl/` a `historico.json` y se cargan con `etl:load`.
Detalle en [ETL.md](ETL.md).

## Código compartido (src/shared)

Funciones puras usadas por el navegador, el Worker y los scripts, todas con pruebas:
`dinero.ts`, `fechas.ts`, `texto.ts` (normalizar, similitud), `claves.ts` (claves de cliente/producto,
placas, posibles duplicados), `categorias.ts`, `estados.ts`, `estadisticas.ts`, `presupuesto.ts`
(tipos de entrada, totales, fechas en letras, nombres, mensaje para compartir, ajustes),
`pdf-presupuesto.ts`, `respaldo.ts`.

## Pruebas

- **Vitest**. `npm test` corre todo (~80 pruebas, ~40 s).
- La API completa se prueba con PGlite (Postgres en memoria) aplicando las migraciones reales:
  `src/worker/api.test.ts`, `presupuestos.test.ts`, `respaldo.test.ts` (Google simulado),
  `copia-base.test.ts`; migraciones con datos viejos en `src/db/migracion.test.ts`.
- Todos los datos de prueba son **inventados** (regla del repo).

## Decisiones importantes

Resumen; la lista con fechas está en [CLAUDE.md](../CLAUDE.md#decisiones-más-reciente-arriba).

- **Cloudflare Workers** para hospedar: gratis, permite uso comercial y no se duerme
  (Vercel Hobby prohíbe uso comercial, Render se duerme, Supabase pausa por inactividad).
- **Access identifica, la app autoriza** (solicitudes de acceso en vez de lista fija de correos).
- **El PDF se genera en el navegador** (CPU del Worker) y es el entregable: se lo pasan al jefe,
  que lo manda al cliente fuera de la app.
- **El membrete y los íconos viven en la base**, no en el repo (es público).
- **Respaldo solo de lo creado en la app** (el histórico ya está en los Excel), una pestaña por
  presupuesto en un archivo del Drive del admin (las cuentas de servicio no tienen espacio en Drive
  para crear archivos).
- **Compartir con el menú del sistema** y no con `wa.me` (solo manda texto; el PDF tendría que estar
  en un link público).
- **La copia de la base no se sube sola a Drive**: sin espacio de Drive para la cuenta de servicio y
  sin CPU para un cron grande; se descarga con recordatorio mensual o por terminal.
