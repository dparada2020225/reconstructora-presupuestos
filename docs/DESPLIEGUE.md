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

## 4. Google Cloud (respaldo en Sheets, fase 5)

1. https://console.cloud.google.com → proyecto nuevo `reconstructora-presupuestos`.
2. Habilitar **Google Sheets API** y **Google Drive API**.
3. **IAM → Service Accounts → Create** → crear llave JSON (no se sube a ningún lado).
4. Secretos del Worker: `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`.
5. En el Drive del admin: subir la plantilla FORMATO como Google Sheets, compartirla
   con el correo de la cuenta de servicio (Editor) y guardar su ID en `SHEETS_RESPALDO_ID`.

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
