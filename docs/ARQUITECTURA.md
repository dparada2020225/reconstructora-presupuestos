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
| Presupuesto desde fotos | El navegador achica las fotos (1600 px, JPG); el Worker solo las reenvía a la IA y valida el JSON |

## Autenticación y permisos

Hay dos formas de entrar, y las dos terminan en la **misma sesión de la app** (cookie `sesion`,
JWT HS256 firmado con `SESSION_SECRET`, `HttpOnly`, `SameSite=Lax`, 30 días):

```
/entrar ─┬─ "Google o código" ─▶ /acceso  (Cloudflare Access protege SOLO esta ruta)
         │                         └▶ el Worker verifica el JWT de Access, abre la sesión → /
         └─ correo + contraseña ─▶ POST /api/sesion (hash PBKDF2) → abre la sesión → /
```

1. **Cloudflare Access** protege solo `/acceso`. Su política deja pasar a *cualquier* correo
   verificado (Google o PIN): Access solo **identifica**. El Worker verifica su JWT
   (`Cf-Access-Jwt-Assertion`) con las llaves del equipo (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`).
2. **Contraseña** (`src/worker/routes/sesion.ts`): para quien no tiene cómo entrar con Google o
   correo. El admin la crea en *Usuarios* (o `npm run usuarios:clave`). Se guarda solo el hash
   PBKDF2-SHA256 con sal (`src/shared/clave.ts`, 30 000 iteraciones ≈ 5 ms de CPU); **no se puede
   ver**, solo cambiar. 5 intentos fallidos seguidos bloquean ese usuario 15 minutos. Si el correo no
   existe se calcula un hash igual (no se delata qué correos existen).
3. **Quien tiene contraseña solo entra con contraseña**: Access no lo deja pasar (su correo en
   Google podría ser de otra persona).
4. La app **autoriza** en cada petición (`src/worker/middleware/auth.ts`): `DEV_AUTH_EMAIL` en local;
   si no, la cookie de sesión (y que `clave_version` coincida: cambiar la contraseña cierra las
   sesiones abiertas); y por compatibilidad, el JWT de Access si viene en la petición.
   - No existe → (Access) se crea como `pendiente` → 403 `pendiente`.
   - `pendiente` o `denegado` → 403 con ese estado (la SPA muestra el aviso).
   - Sin sesión → 401 y la SPA manda a `/entrar`.
5. Roles: `usuario` (todo) y `admin` (además Usuarios, Ajustes del membrete, respaldo "rehacer"
   y copia de la base). `requiereRol("admin")` protege esas rutas.

Rutas públicas: `/api/health`, `/api/sesion` y los archivos del SPA (que no tienen datos).
`/acceso` lo cuida Access.

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

### Presupuesto desde fotos
- Navegador (`src/client/lector/`): achica cada foto a 1600 px de lado largo en JPG
  (`achicarFoto`), manda `POST /api/lector` con las fotos y los ~200 nombres más usados del
  catálogo (le ayudan a la IA a entender la letra).
- Worker (`src/worker/lector.ts`, `routes/lector.ts`): revisa el límite diario
  (`configuracion.lector_uso`), arma las instrucciones (`instrucciones()` en
  `src/shared/lector.ts`) y llama al lector escogido en Ajustes (`configuracion.lector_proveedor`):
  - **Cloudflare Workers AI** por el binding `AI` (`@cf/google/gemma-4-26b-a4b-it` o
    `@cf/meta/llama-4-scout-17b-16e-instruct`): gratis hasta 10 000 neuronas al día (se renueva a
    las 00:00 UTC); las fotos no salen de Cloudflare ni se usan para entrenar.
  - **Claude** por la API de Anthropic (`fetch` a `/v1/messages`, llave en el secreto
    `ANTHROPIC_API_KEY`): de pago por uso con créditos prepagados; la API no entrena con los datos.
- La respuesta se limpia con `extraerJson` + `normalizarLectura` (montos en texto, RESUMEN/TOTAL
  copiados como renglones, campos de más o de menos). No se guarda nada.
- De vuelta en el navegador, `estadoDesdeLectura` arma el estado del editor (cliente y bus por
  clave o parecido ≥ 0.85, precio del renglón con cantidad 1 salvo "c/u") y `revisarLectura` saca
  los avisos (sumas contra TOTAL escrito, `[?]`, renglones sin precio). Las fotos se quedan en
  memoria de la pestaña (`recordarFotos`) para verlas junto al presupuesto ya guardado.
- **Pegar de Claude** (`?modo=pegar`, `src/client/lector/PegarDeClaude.tsx`): el mismo JSON, pero
  escrito por Claude en un chat (skill `/presupuestos` sin acceso a la app, p. ej. desde el
  teléfono). Se limpia y revisa en el navegador con las mismas funciones; no llama a la API del lector.

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
