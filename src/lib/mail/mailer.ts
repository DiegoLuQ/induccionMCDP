import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  /**
   * Dominio institucional del colegio activo (ej. "colegiomacaya.cl").
   * Permite enviar desde la cuenta del propio establecimiento.
   */
  institutionDomain?: string;
}

interface SmtpAccount {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** "colegiomacaya.cl" -> "COLEGIOMACAYA_CL" */
function domainKey(domain: string): string {
  return domain.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/**
 * Resuelve las credenciales SMTP del colegio, con fallback a la cuenta global.
 * Variables por colegio: SMTP_USER__<KEY>, SMTP_PASSWORD__<KEY>, MAIL_FROM__<KEY>.
 */
function resolveAccount(institutionDomain?: string): SmtpAccount | null {
  // SMTP_SERVER se acepta como alias por compatibilidad con los scripts
  // Python existentes del colegio.
  const host = process.env.SMTP_HOST ?? process.env.SMTP_SERVER;
  if (!host) return null;

  const base: SmtpAccount = {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.MAIL_FROM ?? "Inducciones <no-reply@localhost>",
  };

  if (!institutionDomain) return base;

  const key = domainKey(institutionDomain);
  const user = process.env[`SMTP_USER__${key}`];
  if (!user) return base;

  return {
    ...base,
    user,
    password: process.env[`SMTP_PASSWORD__${key}`] ?? base.password,
    from: process.env[`MAIL_FROM__${key}`] ?? user,
  };
}

const transporters = new Map<string, Transporter>();

function getTransporter(account: SmtpAccount): Transporter {
  const cacheKey = `${account.host}:${account.port}:${account.user ?? "anon"}`;
  const cached = transporters.get(cacheKey);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: account.user
      ? { user: account.user, pass: account.password }
      : undefined,
  });

  transporters.set(cacheKey, transporter);
  return transporter;
}

/**
 * Envía un correo desde la cuenta del colegio correspondiente. Si no hay SMTP
 * configurado (desarrollo), lo imprime en consola en vez de fallar, para no
 * bloquear el flujo de invitaciones.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const { institutionDomain, ...mail } = message;
  const account = resolveAccount(institutionDomain);

  if (!account) {
    console.info(
      `[mailer] SMTP no configurado. Correo simulado:\n` +
        `  Para: ${mail.to}\n  Asunto: ${mail.subject}\n` +
        `  ${mail.text ?? "(ver HTML)"}\n`,
    );
    return true;
  }

  try {
    await getTransporter(account).sendMail({ from: account.from, ...mail });
    return true;
  } catch (error) {
    console.error("[mailer] Error enviando correo:", error);
    return false;
  }
}
