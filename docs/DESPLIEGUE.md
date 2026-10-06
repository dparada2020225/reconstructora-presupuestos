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

1. **Zero Trust** (plan Free, hasta 50 usuarios) → elegir un nombre de equipo
   (queda `<equipo>.cloudflareaccess.com` → `ACCESS_TEAM_DOMAIN`).
2. **Access → Applications → Add → Self-hosted**: dominio del Worker
   (`reconstructora-presupuestos.<cuenta>.workers.dev`).
3. Política **Allow** con *Include → Everyone*: Access solo identifica el correo;
   quién entra de verdad lo decide la app (tabla `usuarios`).
4. Método de login: "One-time PIN" (código al correo) y, si se quiere, Google.
5. Copiar el **Application Audience (AUD) Tag** → secreto `ACCESS_AUD`.
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
