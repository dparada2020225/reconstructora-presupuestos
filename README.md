# reconstructora-presupuestos

App web para crear, gestionar y respaldar presupuestos de un taller de
reconstrucción de buses: clientes, unidades, catálogo de trabajos, extras,
estados, PDF y estadísticas del histórico.

- **Frontend:** React + Vite + TypeScript + Tailwind
- **API:** Hono en Cloudflare Workers
- **Base de datos:** Postgres (Neon) + Drizzle ORM
- **Respaldo:** Google Sheets con el formato original
- **Deploy:** automático en cada push a `main`

> Este repositorio es público y **no contiene datos del negocio**. Los datos
> históricos se procesan localmente con `scripts/etl` y viven solo en la base de datos.

## Empezar

```bash
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run dev
```

- Plan por fases: [`docs/PLAN.md`](docs/PLAN.md)
- Cuentas y despliegue: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)
- Guía para el asistente de código: [`CLAUDE.md`](CLAUDE.md)
