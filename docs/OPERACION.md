# Operación y mantenimiento

Qué hacer para que la app siga funcionando, cómo recuperarse si algo sale mal y qué significan
los errores. Las cuentas y la configuración inicial están en [DESPLIEGUE.md](DESPLIEGUE.md).

- [Rutina](#rutina)
- [Publicar cambios](#publicar-cambios)
- [Usuarios y accesos](#usuarios-y-accesos)
- [Copias de la base](#copias-de-la-base)
- [Restaurar una copia](#restaurar-una-copia)
- [Respaldo en Google Sheets](#respaldo-en-google-sheets)
- [Llaves y secretos](#llaves-y-secretos)
- [Límites de los planes gratis](#límites-de-los-planes-gratis)
- [Solución de problemas](#solución-de-problemas)

## Rutina

| Cada | Qué | Dónde |
|---|---|---|
| Mes (la app avisa en Inicio) | Descargar copia de toda la base y guardarla fuera del repo | Ajustes → Copia de toda la base |
| Semana | Revisar que no haya presupuestos pendientes de copiar a Sheets | Ajustes → Respaldo en Google Sheets |
| Cuando entra alguien nuevo | Autorizarlo | Usuarios |
| De vez en cuando | Unir clientes/productos repetidos | Clientes / Productos → Posibles repetidos |

## Publicar cambios

```bash
npm run check:privacidad && npm run typecheck && npm test && npm run build
# si el cambio trae una migración nueva (carpeta drizzle/):
npm run db:migrate              # dev
npm run db:migrate:produccion   # pide la URL de production
git push                        # Cloudflare compila y publica en 1-2 minutos
```

Migrar producción **antes** del push: si el código nuevo llega primero, las partes que usan las
columnas nuevas fallan hasta que se migre. Para ver si ya se publicó: Cloudflare → Workers →
`reconstructora-presupuestos` → *Deployments*.

**Volver a una versión anterior**: en *Deployments*, el despliegue anterior → *Rollback*. (Si la
versión nueva traía una migración, el código viejo sigue funcionando con columnas de más.)

## Usuarios y accesos

- Quien entra por primera vez queda **pendiente**; el admin lo autoriza en *Usuarios*.
- Para quitarle el acceso a alguien: *Usuarios → Quitar acceso*. (Access lo sigue identificando, pero
  la app lo rechaza.)
- Para hacer admin a alguien más: hoy se cambia el `rol` en la tabla `usuarios` (Neon → SQL Editor:
  `update usuarios set rol = 'admin' where email = '…';`) o con `PATCH /api/usuarios/:id`.
- El admin no se puede quitar a sí mismo el acceso ni el rol desde la app.
- Login con Google: la app de OAuth en Google Cloud tiene que estar **publicada** (no "en prueba"),
  si no, solo entran los correos de prueba. El código por correo (PIN) funciona siempre.

## Copias de la base

Tres capas de respaldo:

1. **Neon** guarda historial reciente de la rama (se puede restaurar a un momento de las últimas
   horas desde la consola de Neon; el plazo depende del plan gratis).
2. **Copia completa (JSON)**: Ajustes → *Descargar copia (.json)* (o `npm run db:copia:produccion`,
   que la deja en `../copias`). Tiene todas las tablas, usuarios y ajustes.
3. **Google Sheets**: una pestaña por presupuesto de la app, con el formato del Excel (no es para
   restaurar la base, es para leer o imprimir un presupuesto si la app no está).

Las copias tienen todos los datos del negocio: guárdalas en tu compu o en tu Drive personal, **nunca
en el repo** (`check:privacidad` y `.gitignore` bloquean `copia-base*.json` y `copias/`).

## Restaurar una copia

> Reemplaza **todo** el contenido de la base por el de la copia.

1. Probar primero en una base que no sea la de verdad: en Neon, crear una rama nueva y poner su URL
   en `.env`, o usar la rama `dev`.
2. Que la base destino tenga las mismas migraciones que la copia (`npm run db:migrate`); si no, el
   script se niega y lo dice.
3. Correr:
   ```bash
   npm run db:restaurar -- ruta/copia-base-AAAA-MM-DD.json                # a la base de .env
   npm run db:restaurar -- ruta/copia-base-AAAA-MM-DD.json --produccion   # pide la URL de production
   ```
4. Muestra cuántas filas trae cada tabla y pide escribir `RESTAURAR`.
5. Todo va en una transacción: si algo falla, la base queda como estaba. Al terminar, los ids nuevos
   siguen después del último de la copia.

## Respaldo en Google Sheets

- Se dispara solo al guardar o cambiar el estado de un presupuesto de la app que no es borrador.
- **Pendientes** = presupuestos cambiados después de su última copia. *Copiar pendientes* los copia
  de a 5 hasta terminar.
- **Volver a copiar todos** marca todos como pendientes (útil si se cambió la plantilla FORMATO).
- Cambiar la plantilla: editar la pestaña **FORMATO** del archivo de respaldo. La app ubica las filas
  buscando "Lugar y fecha:", "Cliente:", "No. Placa", la primera línea con `-`, el TOTAL y la NOTA;
  se pueden mover, pero esos textos tienen que seguir ahí.
- Cambiar de archivo: crear el nuevo con su pestaña FORMATO, compartirlo con la cuenta de servicio
  (Editor) y volver a correr `npm run configurar:google`.

## Llaves y secretos

| Secreto | Dónde vive | Cómo cambiarlo |
|---|---|---|
| `DATABASE_URL` de production | Secreto del Worker | Neon → *Reset password* de la rama → `npx wrangler secret put DATABASE_URL` (o `npm run configurar:produccion`) |
| `DATABASE_URL` de dev | `.env` y `.dev.vars` (locales) | Editar los archivos |
| Llave de la cuenta de servicio de Google | Secreto del Worker (`GOOGLE_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`) y `.dev.vars` | Google Cloud → IAM → Cuentas de servicio → *Claves*: crear una nueva JSON, `npm run configurar:google`, y **borrar la vieja** |
| Id del archivo de respaldo | Secreto `SHEETS_RESPALDO_ID` | `npm run configurar:google` |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | `wrangler.jsonc` → `vars` (no son secretos) | Editar el archivo y push |

Si una llave se filtra (se subió por error, alguien la vio): cambiarla de inmediato con la tabla de
arriba. Nunca pegar secretos en issues, commits ni chats.

> `wrangler deploy` borra las variables de texto que se crean desde el dashboard; por eso las
> públicas viven en `wrangler.jsonc`. Los **secretos** sí se conservan.

## Límites de los planes gratis

| Servicio | Límite que importa |
|---|---|
| Cloudflare Workers | 100 000 peticiones/día; ~10 ms de CPU por petición (por eso lo pesado corre en el navegador). |
| Cloudflare Access (Zero Trust Free) | 50 usuarios. |
| Neon | Almacenamiento y horas de cómputo limitados (revisar el uso en la consola de Neon). La base se duerme sola y despierta en la primera consulta: la primera carga después de un rato puede tardar un poco. |
| Google Sheets | Hasta 10 millones de celdas por archivo; si se llena, crear otro archivo de respaldo. |

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "Tu solicitud de acceso quedó registrada…" | Usuario nuevo (pendiente) | El admin lo autoriza en Usuarios. |
| "Tu acceso a la app fue denegado" | Usuario denegado | El admin lo cambia en Usuarios. |
| Con Google no entra, con PIN sí | App de OAuth "en prueba" | Google Cloud → Pantalla de consentimiento → *Publicar app*. |
| "No autenticado" en local | Falta `DEV_AUTH_EMAIL` en `.dev.vars` | Agregarlo y reiniciar `npm run dev`. |
| `npm run dev` o wrangler fallan raro | Node 20 | `nvm use 24` (ver `.nvmrc`). |
| Partes nuevas fallan después de un push | Migración no aplicada a production | `npm run db:migrate:produccion`. |
| "Base de datos: Sin conexión" en Inicio | Neon caída o URL mala | Revisar Neon; `GET /api/health`; el secreto `DATABASE_URL`. |
| `#ERROR!` en los TOTAL de Sheets | Pestañas creadas con la versión vieja (separador de fórmulas) | Ajustes → *Volver a copiar todos* → *Copiar pendientes*. |
| "El archivo de respaldo no tiene una pestaña llamada FORMATO" | Se renombró o borró la plantilla | Volver a crear/renombrar la pestaña `FORMATO`. |
| "Google no aceptó la cuenta de servicio" | Llave borrada, mal pegada o de otro proyecto | Crear llave nueva y `npm run configurar:google`. |
| "The caller does not have permission" | Archivo no compartido con la cuenta de servicio | Compartir el archivo como **Editor** con el correo `…iam.gserviceaccount.com`. |
| "Google Sheets API has not been used / is disabled" | API apagada | Google Cloud → APIs → Google Sheets API → Habilitar. |
| No sale el botón Compartir | El navegador no comparte archivos | Usar Descargar PDF; en la compu, Chrome/Edge actualizados. |
| Al compartir no sale WhatsApp (compu) | Falta la app de escritorio | Instalar WhatsApp para Windows, o compartir desde el celular. |
| "Ver PDF" no abre | Ventanas emergentes bloqueadas | Permitirlas para la app, o Descargar PDF. |
| Un total del histórico se ve inflado | Resumen del Excel leído como líneas | Ver [ETL.md](ETL.md#problemas-conocidos-del-histórico) y corregir el presupuesto en la app. |
| Un cliente/producto aparece dos veces | Escrito distinto | Unirlos (Clientes/Productos → Posibles repetidos). |
| `db:restaurar` dice "migraciones" | La base destino no está al día | `npm run db:migrate` (o `db:migrate:produccion`) y volver a intentar. |
