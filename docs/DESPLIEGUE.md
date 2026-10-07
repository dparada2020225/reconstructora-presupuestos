# Cuentas, configuración y despliegue

Todo con planes gratis. Los valores secretos van en `.env` / `.dev.vars` (locales)
y en los secretos del Worker; nunca en el repo.

## 1. Neon (Postgres)

1. Crear cuenta en https://neon.com (con GitHub o Google) y un proyecto
   `reconstructora-presupuestos` (región AWS us-east-1 o la más cercana).
2. Crear una rama `dev` además de `main`.
3. Copiar el *connection string* de cada rama (botón **Connect**, con `sslmode=require`).
   - `main` → secreto `DATABASE_URL` del Worker y `.env` cuando cargues datos reales.
   - `dev` → `.dev.vars` y `.env` para desarrollar.
4. `npm run db:migrate` (con la URL correspondiente en `.env`) para crear las tablas.
5. `npm run db:seed-usuarios` con `SEED_USUARIOS` en `.env` (solo tu correo como admin).

## 2. Cloudflare Workers (hosting + deploy automático)

1. Crear cuenta en https://dash.cloudflare.com.
2. **Workers & Pages → Create → Import a repository** → elegir
   `reconstructora-presupuestos`.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Rama de producción: `main`
3. En el Worker → **Settings → Variables and Secrets** agregar como *Secret*:
   `DATABASE_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (y luego los de Google).
4. Desde ahí, cada `git push` a `main` construye y despliega solo.

## 3. Cloudflare Access (login)

1. **Zero Trust** (plan Free, hasta 50 usuarios). El equipo queda como
   `<equipo>.cloudflareaccess.com` → `ACCESS_TEAM_DOMAIN`.
2. **Zero Trust → Access controls → Policies → Add a policy**: Allow, *Include → Everyone*,
   sesión 1 mes. Access solo identifica el correo; quién entra lo decide la app (tabla `usuarios`).
3. **Workers → reconstructora-presupuestos → Access → Protect this Worker**: scope *All traffic*
   y la política del paso 2.
4. Login: "One-time PIN" (código al correo) viene activo; Google es opcional.
5. Copiar **AUD tag** y dominio del equipo a `vars` en `wrangler.jsonc` (no son secretos).
6. Sembrar solo al admin (`npm run db:seed-usuarios`). Los demás entran, quedan
   pendientes y el admin los autoriza en la página **Usuarios**.

## Google Sheets (respaldo, fase 5)

Cada presupuesto de la app que deja de ser borrador se copia a una pestaña de UN archivo de
Sheets en el Drive del admin, duplicando la pestaña **FORMATO** (el formato de siempre). Se
actualiza solo al guardar o cambiar de estado; si Google falla, el presupuesto queda guardado y
aparece como pendiente (Ajustes → "Copiar pendientes").

1. **API:** <https://console.cloud.google.com> → proyecto `reconstructora-presupuestos` →
   *APIs y servicios → Biblioteca* → **Google Sheets API** → *Habilitar*.
2. **Cuenta de servicio:** *IAM y administración → Cuentas de servicio → Crear cuenta de servicio*
   (nombre: `respaldo-presupuestos`, sin roles). Entrar a la cuenta → *Claves → Agregar clave →
   Crear clave nueva → JSON*. Se descarga un `.json`: guardarlo **fuera del repo** (p. ej. en la
   carpeta `presupuestos`). Es la llave; no se comparte ni se sube.
3. **Archivo de respaldo:** en Drive crear una hoja de cálculo nueva (p. ej. "Respaldo presupuestos").
   Desde el Sheets de siempre, clic derecho en la pestaña **FORMATO → Copiar en → Hoja de cálculo
   existente** → la nueva. En la nueva, renombrar la pestaña copiada a `FORMATO` (quitar "Copia de").
4. **Compartir** el archivo nuevo (botón *Compartir*) con el correo de la cuenta de servicio
   (`…@….iam.gserviceaccount.com`, está en el `.json`) como **Editor**.
5. `npm run configurar:google`: pide la ruta del `.json` (se puede arrastrar a la terminal) y el link
   del archivo; escribe `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `SHEETS_RESPALDO_ID` en
   `.dev.vars` y los guarda como secretos del Worker.
6. En la app: **Ajustes → Respaldo en Google Sheets → Copiar pendientes**.

La pestaña FORMATO se lee para ubicar las filas ("Lugar y fecha:", "Cliente:", "No. Placa", la
primera línea con "-", el TOTAL y la NOTA), así que puede tener filas de más arriba sin problema.

## Desarrollo local

```bash
npm install
cp .env.example .env            # y llenar
cp .dev.vars.example .dev.vars  # y llenar
npm run db:migrate
npm run dev
```

## Cambios que agregan tablas o columnas

Cuando un commit trae una migración nueva en `drizzle/`:

```bash
npm run db:migrate              # rama dev (la de .env)
npm run db:migrate:produccion   # pide la URL de production y la migra
git push                        # recién entonces: Workers Builds publica el código nuevo
```

Si se hace push antes de migrar producción, las partes nuevas fallan hasta que se migre.

## Ojo con `etl:load` en producción

`etl:load` borra y vuelve a crear todo lo que vino del histórico (trabajos, presupuestos y
buses sin uso). Clientes y productos se reconocen por alias, así que las uniones hechas en la
app se respetan, pero cambios a trabajos o buses del histórico se perderían. Una vez que se
empieza a editar en la app, **no volver a correr `etl:load:produccion`**.

## Membrete del PDF (una vez por base)

Entrar como admin → **Ajustes** y llenar empresa, correo, teléfono, firma, lugar por defecto y subir el
logo. Se guarda en la tabla `configuracion` de esa base (hay que hacerlo en dev y en production).
