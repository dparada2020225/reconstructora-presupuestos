import type { Db } from "./db";

export interface Env {
  ASSETS: Fetcher;
  DATABASE_URL: string;
  /** Solo en desarrollo local (.dev.vars). Simula el usuario logueado. */
  DEV_AUTH_EMAIL?: string;
  /** Cloudflare Access: dominio del equipo, p. ej. "mi-equipo.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access: Application Audience (AUD) tag. */
  ACCESS_AUD?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  SHEETS_RESPALDO_ID?: string;
}

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: "admin" | "editor" | "revisor";
}

export type AppEnv = {
  Bindings: Env;
  Variables: { db: Db; usuario: Usuario };
};
