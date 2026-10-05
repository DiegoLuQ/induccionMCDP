import "server-only";

interface InvitationMailParams {
  name: string;
  recipientName?: string;
  isForJefe?: boolean;
  institutionName: string;
  institutionLogoUrl?: string | null;
  courseTitle: string;
  link: string;
  pin?: string | null;
  expiresAt: Date;
}

function formatCl(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

export function invitationEmail(params: InvitationMailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const isJefe = Boolean(params.isForJefe && params.recipientName);
  const subject = isJefe
    ? `Acceso Inducción "${params.courseTitle}" · Funcionario: ${params.name}`
    : `Inducción "${params.courseTitle}" · ${params.institutionName}`;

  const greeting = isJefe
    ? `Estimado(a) <strong>${params.recipientName}</strong> (Jefatura de Área):`
    : `Hola <strong>${params.name}</strong>,`;

  const explanation = isJefe
    ? `Se ha generado el acceso para la inducción obligatoria <strong>&laquo;${params.courseTitle}&raquo;</strong> correspondiente al funcionario <strong>${params.name}</strong>. Por favor comparta este enlace e instrucciones con el funcionario para su realización.`
    : `Se te ha asignado la inducción <strong>&laquo;${params.courseTitle}&raquo;</strong>. Ingresa con el siguiente enlace para comenzar tu proceso.`;

  const html = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="background:#0f172a;padding:24px 28px;color:#f8fafc;">
        ${
          params.institutionLogoUrl
            ? `<img src="${params.institutionLogoUrl}" alt="${params.institutionName}" style="height:36px;margin-bottom:12px;" />`
            : ""
        }
        <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;">
          ${params.institutionName}
        </p>
        <h1 style="margin:6px 0 0;font-size:20px;font-weight:600;">
          ${isJefe ? "Acceso a Inducción para Funcionario" : "Tienes una inducción asignada"}
        </h1>
      </div>

      <div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.6;">
        <p style="margin:0 0 16px;">${greeting}</p>
        <p style="margin:0 0 16px;">
          ${explanation}
        </p>

        <p style="text-align:center;margin:24px 0;">
          <a href="${params.link}"
             style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;
                    padding:14px 32px;border-radius:8px;font-weight:600;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
            ${isJefe ? "Abrir / Compartir Enlace de Inducción" : "Acceder a mi inducción"}
          </a>
        </p>

        ${
          params.pin
            ? `
        <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:18px;text-align:center;margin-top:20px;">
          <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">
            Código PIN de Verificación
          </p>
          <p style="margin:0;font-size:30px;font-weight:700;letter-spacing:.34em;font-family:ui-monospace,monospace;color:#0f172a;">
            ${params.pin}
          </p>
        </div>`
            : `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 18px;text-align:center;margin-top:20px;font-size:13px;color:#166534;">
          ✓ Este enlace cuenta con <strong>acceso directo seguro</strong> (no requiere PIN adicional).
        </div>`
        }

        <p style="margin:20px 0 0;font-size:13px;color:#64748b;">
          Este enlace tiene vigencia hasta el <strong>${formatCl(params.expiresAt)}</strong>.
        </p>
      </div>

      <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
        Plataforma de Inducción y Capacitación · Multi-tenant
      </div>
    </div>
  </div>`;

  const textLines = [
    isJefe
      ? `Estimado(a) ${params.recipientName} (Jefatura de Área):`
      : `Hola ${params.name},`,
    ``,
    explanation,
    `Enlace de acceso: ${params.link}`,
  ];

  if (params.pin) {
    textLines.push(`Código PIN: ${params.pin}`);
  }

  textLines.push(`Vigencia hasta: ${formatCl(params.expiresAt)}`);

  return { subject, html, text: textLines.join("\n") };
}

export function completionEmail(params: {
  name: string;
  courseTitle: string;
  score: number;
  institutionName: string;
}): { subject: string; html: string; text: string } {
  const subject = `Inducción completada: ${params.courseTitle}`;
  const html = `
  <div style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <h1 style="font-size:18px;">¡Inducción completada!</h1>
    <p>Hola <strong>${params.name}</strong>, registramos la aprobación de
    <strong>&laquo;${params.courseTitle}&raquo;</strong> con un puntaje de
    <strong>${params.score}%</strong>.</p>
    <p style="font-size:13px;color:#64748b;">${params.institutionName} · Constancia registrada en el sistema.</p>
  </div>`;
  const text = `Hola ${params.name}, completaste "${params.courseTitle}" con ${params.score}%.`;
  return { subject, html, text };
}

export interface ConsolidatedFuncionarioItem {
  name: string;
  rut: string;
  positionName?: string;
  link: string;
  pin?: string | null;
  /** Enlace temporal (7 días) para descargar la Constancia de Participación. */
  certificateUrl?: string | null;
}

export interface ConsolidatedInvitationMailParams {
  recipientName?: string;
  areaName: string;
  institutionName: string;
  institutionLogoUrl?: string | null;
  courseTitle: string;
  funcionarios: ConsolidatedFuncionarioItem[];
  expiresAt: Date;
}

export function consolidatedInvitationEmail(params: ConsolidatedInvitationMailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const recipient = params.recipientName ? params.recipientName : "Jefatura de Área";
  const subject = `Accesos a Inducción "${params.courseTitle}" · ${params.areaName} (${params.funcionarios.length} funcionario${params.funcionarios.length > 1 ? "s" : ""})`;

  const rowsHtml = params.funcionarios
    .map(
      (f, idx) => `
      <tr style="border-bottom:1px solid #e2e8f0;background-color:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="padding:12px 14px;font-size:14px;color:#0f172a;">
          <strong>${f.name}</strong><br/>
          <span style="font-size:12px;color:#64748b;font-family:ui-monospace,monospace;">${f.rut}</span>
        </td>
        <td style="padding:12px 14px;font-size:13px;color:#334155;">
          ${f.positionName || "Sin cargo"}
        </td>
        <td style="padding:12px 14px;font-size:13px;text-align:center;">
          ${
            f.pin
              ? `<span style="font-family:ui-monospace,monospace;font-weight:700;letter-spacing:0.15em;background:#e2e8f0;padding:4px 8px;border-radius:4px;color:#0f172a;">${f.pin}</span>`
              : `<span style="font-size:11px;color:#16a34a;font-weight:600;">Acceso directo</span>`
          }
        </td>
        <td style="padding:12px 14px;text-align:center;min-width:220px;">
          <div style="display:flex;justify-content:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
            <a href="${f.link}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:7px 14px;border-radius:6px;font-size:11px;font-weight:600;">
              Abrir Inducción
            </a>
            <a href="${f.link}" style="display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;text-decoration:none;padding:7px 12px;border-radius:6px;font-size:11px;font-weight:600;">
              🔗 Copiar Enlace
            </a>
            ${
              f.certificateUrl
                ? `<a href="${f.certificateUrl}" style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;text-decoration:none;padding:7px 12px;border-radius:6px;font-size:11px;font-weight:600;">
              📄 Descargar constancia
            </a>`
                : ""
            }
          </div>
          <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:6px 8px;border-radius:6px;font-size:10.5px;text-align:left;max-width:270px;margin:0 auto;">
            <div style="font-size:10px;font-weight:700;color:#0284c7;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">
              📋 Enlace para compartir:
            </div>
            <a href="${f.link}" style="font-family:ui-monospace,monospace;font-size:10px;color:#2563eb;word-break:break-all;text-decoration:underline;display:block;">
              ${f.link}
            </a>
          </div>
        </td>
      </tr>
    `,
    )
    .join("");

  const html = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;padding:32px 16px;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="background:#0f172a;padding:24px 28px;color:#f8fafc;">
        ${
          params.institutionLogoUrl
            ? `<img src="${params.institutionLogoUrl}" alt="${params.institutionName}" style="height:36px;margin-bottom:12px;" />`
            : ""
        }
        <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;">
          ${params.institutionName} · ${params.areaName}
        </p>
        <h1 style="margin:6px 0 0;font-size:20px;font-weight:600;">
          Accesos a Inducción Obligatoria (${params.funcionarios.length} funcionario${params.funcionarios.length > 1 ? "s" : ""})
        </h1>
      </div>

      <div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.6;">
        <p style="margin:0 0 14px;">
          Estimado(a) <strong>${recipient}</strong>:
        </p>
        <p style="margin:0 0 20px;color:#334155;">
          A continuación se detallan los enlaces y códigos de acceso a la inducción <strong>&laquo;${params.courseTitle}&raquo;</strong> correspondientes a los funcionarios de su área (<strong>${params.areaName}</strong>). Por favor comparta cada enlace y PIN respectivo con cada colaborador para su debida realización:
        </p>

        <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;text-align:left;">
            <thead>
              <tr style="background:#f1f5f9;border-bottom:1px solid #e2e8f0;">
                <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;">Funcionario</th>
                <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;">Cargo</th>
                <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;text-align:center;">PIN</th>
                <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;text-align:center;">Enlace</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <p style="margin:0;font-size:13px;color:#64748b;">
          ⏰ Estos enlaces tienen vigencia hasta el <strong>${formatCl(params.expiresAt)}</strong>.
        </p>
        ${
          params.funcionarios.some((f) => f.certificateUrl)
            ? `<p style="margin:8px 0 0;font-size:13px;color:#64748b;">
          📄 Los botones <strong>Descargar constancia</strong> generan la Constancia de Participación en PDF de cada funcionario y están disponibles por <strong>7 días</strong> desde este envío.
        </p>`
            : ""
        }
      </div>

      <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
        Plataforma de Inducción y Capacitación · Multi-tenant
      </div>
    </div>
  </div>`;

  const textLines = [
    `Estimado(a) ${recipient}:`,
    ``,
    `Accesos para inducción "${params.courseTitle}" - Área: ${params.areaName}`,
    ``,
    ...params.funcionarios.map(
      (f) =>
        `* ${f.name} (${f.rut}) - Cargo: ${f.positionName || "N/A"}\n  Enlace: ${f.link}${f.pin ? ` | PIN: ${f.pin}` : ""}${f.certificateUrl ? `\n  Constancia (7 días): ${f.certificateUrl}` : ""}`,
    ),
    ``,
    `Vigencia hasta: ${formatCl(params.expiresAt)}`,
  ];

  return { subject, html, text: textLines.join("\n") };
}
