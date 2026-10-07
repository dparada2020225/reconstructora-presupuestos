# Cuentas, configuración y despliegue

Cómo montar todo **desde cero** (o rehacerlo). Todo con planes gratis. Los secretos van en
`.env` / `.dev.vars` (locales, ignorados) y en los secretos del Worker; **nunca en el repo**.
El día a día (publicar, copias, problemas) está en [OPERACION.md](OPERACION.md).

Orden recomendado: Neon → Cloudflare Workers → Cloudflare Access → login con Google (opcional) →
Google Sheets → membrete.

## 1. Neon (Postgres)

1. Crear cuenta en <https://neon.com> y un proyecto `reconstructora-presupuestos` (región más cercana).
2. Dos ramas: **`production`** (la de la app publicada; es la principal) y **`dev`** (para trabajar en
   local; sin auto-borrado).
3. Copiar el *connection string* de cada rama (botón **Connect**, sin pooling, con `sslmode=require`).
   - `dev` → `.env` y `.dev.vars`.
   - `production` → **no** se guarda en archivos: los scripts que la necesitan la piden al correr.
4. En local: `npm run db:migrate` y `npm run db:seed-usuarios` (con `SEED_USUARIOS` = tu correo como admin).

## 2. Cloudflare Workers (hosting y deploy automático)

1. Crear cuenta en <https://dash.cloudflare.com>.
2. **Workers & Pages → Create → Import a repository** → el repo `reconstructora-presupuestos`.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Rama de producción: `main`
3. Primera configuración de production (desde tu compu, con wrangler logueado):
   ```bash
   npm run configurar:produccion   # pide la URL de production: migra, siembra al admin y guarda DATABASE_URL como secreto
   ```
4. Desde ahí, cada `git push` a `main` construye y publica solo (`*.workers.dev`).

Nombre del Worker y configuración: `wrangler.jsonc` (assets del SPA con
`not_found_handling: single-page-application` y `run_worker_first: ["/api/*"]`).

## 3. Cloudflare Access (login)

1. **Zero Trust** (plan Free, hasta 50 usuarios). El equipo queda como `<equipo>.cloudflareaccess.com`.
2. **Access controls → Policies → Add a policy**: *Allow*, **Include → Everyone**, sesión de 1 mes
   (nombre sugerido: "Cualquier correo verificado (la app autoriza)"). Access solo **identifica**;
   quién entra lo decide la app (tabla `usuarios`).
3. En el dashboard: **Workers → reconstructora-presupuestos → Access → Protect this Worker**: alcance
   *All traffic*, con la política del paso 2.
4. Métodos de login: *One-time PIN* (código al correo) viene activo. Google se agrega en el paso 4.
5. Copiar el **dominio del equipo** y el **AUD tag** de la aplicación de Access a `vars` en
   `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). No son secretos; van en el archivo porque
   `wrangler deploy` borra las variables de texto creadas en el dashboard.
6. Los demás usuarios entran, quedan **pendientes** y el admin los autoriza en la página *Usuarios*.

## 4. Login con Google (opcional, recomendado)

1. <https://console.cloud.google.com> → proyecto `reconstructora-presupuestos`.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre de la app,
   correo de soporte. **Publicar la app** (si queda "en prueba", solo entran los correos de prueba).
3. **Credenciales → Crear credenciales → ID de cliente de OAuth** → *Aplicación web*
   (nombre sugerido: "Cloudflare Access"). URI de redirección:
   `https://<equipo>.cloudflareaccess.com/cdn-cgi/access/callback`.
4. En **Zero Trust → Settings → Authentication → Login methods → Add → Google**: pegar el ID y el
   secreto del cliente (el secreto lo pega el dueño; no se guarda en ningún archivo del repo).
5. Probar con *Test*.

## 5. Google Sheets (respaldo de cada presupuesto)

Cada presupuesto de la app que deja de ser borrador se copia a una pestaña de **un** archivo de
Sheets en el Drive del admin, duplicando la pestaña **FORMATO** (el formato del Excel).

1. **API**: Google Cloud → proyecto `reconstructora-presupuestos` → *APIs y servicios → Biblioteca* →
   **Google Sheets API** → *Habilitar*.
2. **Cuenta de servicio**: *IAM y administración → Cuentas de servicio → Crear cuenta de servicio*
   (nombre `respaldo-presupuestos`, **sin roles**). Entrar a la cuenta → *Claves → Agregar clave →
   Crear clave nueva → JSON*. Se descarga un `.json`: es la **llave**. Guardarlo **fuera del repo**
   (p. ej. en la carpeta padre); no se comparte ni se sube.
3. **Archivo de respaldo**: en Drive, hoja de cálculo nueva ("Respaldo presupuestos"). Desde el Excel
   de siempre abierto en Sheets: clic derecho en la pestaña **FORMATO → Copiar en → Hoja de cálculo
   ya creada** → la nueva. En la nueva, renombrar la pestaña a `FORMATO` (quitar "Copia de").
4. **Compartir** el archivo con el correo de la cuenta de servicio
   (`respaldo-presupuestos@<proyecto>.iam.gserviceaccount.com`, también está en el `.json`) como
   **Editor**, sin notificar.
5. En la compu, dentro del repo:
   ```bash
   npm run configurar:google
   ```
   Pide la ruta del `.json` (se puede arrastrar a la terminal) y el link del archivo. Escribe
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `SHEETS_RESPALDO_ID` en `.dev.vars` y los
   guarda como secretos del Worker (si wrangler no está logueado, abre el navegador para autorizarlo).
6. En la app: **Ajustes → Respaldo en Google Sheets → Copiar pendientes**.

La pestaña FORMATO se lee para ubicar las filas ("Lugar y fecha:", "Cliente:", "No. Placa", la
primera línea con `-`, el TOTAL y la NOTA); puede tener filas de más arriba (logo) sin problema.
Las cuentas de servicio no tienen espacio propio en Drive: por eso se escribe en un archivo que es
del admin y no se crean archivos nuevos.

## 6. Membrete del PDF (una vez por base)

Entrar como admin → **Ajustes**: empresa, correo, teléfono, firma, lugar por defecto, nota al pie,
**logo** e **íconos de redes** (una imagen junto a la empresa y otra junto al teléfono). Se guarda
en la tabla `configuracion` **de esa base**: hay que hacerlo en production y, si se quiere ver igual
en local, también en dev.

## 7. Histórico

Cargar los Excel viejos a production **una sola vez, antes de empezar a usar la app**:
`npm run etl:parse` → revisar `revision.md` → `npm run etl:load:produccion`. Detalle y advertencias
en [ETL.md](ETL.md).

## Inventario: qué vive dónde

| Qué | Dónde |
|---|---|
| Código, migraciones, documentación | GitHub (repo público) |
| App publicada | Cloudflare Workers (`*.workers.dev`) |
| Login | Cloudflare Zero Trust (Access) + Google OAuth |
| Datos | Neon (`production`, `dev`) |
| Respaldo por presupuesto | Google Sheets "Respaldo presupuestos" (Drive del admin) |
| Copias de toda la base | Compu / Drive del admin (fuera del repo) |
| Secretos de production | Secretos del Worker (`DATABASE_URL`, `GOOGLE_*`, `SHEETS_RESPALDO_ID`) |
| Secretos de local | `.env`, `.dev.vars` |
| Llave JSON de la cuenta de servicio | Compu del admin, fuera del repo |
| Excel históricos, `overrides.json`, `historico.json` | Carpeta padre del repo / `../_etl` |
| Membrete, logo e íconos | Tabla `configuracion` de cada base |
