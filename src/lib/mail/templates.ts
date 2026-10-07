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
  /** Enlace temporal (7 días) para descargar la Constancia de Participación. */
  certificateUrl?: string | null;
}

function formatCl(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

/** Pasos del proceso de inducción, iguales en el correo a jefatura y al funcionario. */
function inductionSteps(): string[] {
  return [
    "Abrir el enlace de la inducción e ingresar el código PIN.",
    "En el primer ingreso, crear su clave personal y registrar su correo institucional.",
    "Ingresar a la inducción y ver todos los videos de cada cápsula.",
    "Responder las preguntas de las evaluaciones.",
    "Confirmar que terminó la inducción (botón de finalización al completar todo).",
    "Imprimir la Constancia de Participación y firmarla.",
    "Escanear la constancia firmada y enviarla a Recursos Humanos, que la sube a la plataforma.",
  ];
}

function inductionStepsHtml(title: string, note?: string): string {
  const items = inductionSteps()
    .map(
      (step, i) => `
        <tr>
          <td valign="top" style="padding:4px 10px 4px 0;width:26px;">
            <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;background:#0f172a;color:#ffffff;font-size:12px;font-weight:700;text-align:center;">${i + 1}</span>
          </td>
          <td valign="top" style="padding:4px 0;font-size:14px;line-height:1.5;color:#334155;">${step}</td>
        </tr>`,
    )
    .join("");
  return `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:20px 0;">
          <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0f172a;">${title}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">${items}
          </table>
          ${note ? `<p style="margin:10px 0 0;font-size:12px;color:#64748b;">${note}</p>` : ""}
        </div>`;
}

function inductionStepsText(title: string): string[] {
  return [title, ...inductionSteps().map((step, i) => `  ${i + 1}. ${step}`)];
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

        ${inductionStepsHtml(isJefe ? "Pasos que debe seguir el funcionario" : "Paso a paso")}

        ${
          params.certificateUrl
            ? `<p style="text-align:center;margin:0 0 8px;">
          <a href="${params.certificateUrl}" target="_blank"
             style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">
            Descargar constancia para firmar (PDF)
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-align:center;">
          Disponible por 7 días. Si el enlace venció, solicita la constancia a Recursos Humanos.
        </p>`
            : ""
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
    explanation.replace(/<[^>]+>/g, "").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»"),
    `Enlace de acceso: ${params.link}`,
  ];

  if (params.pin) {
    textLines.push(`Código PIN: ${params.pin}`);
  }

  textLines.push(
    ``,
    ...inductionStepsText(isJefe ? "Pasos que debe seguir el funcionario:" : "Paso a paso:"),
  );
  if (params.certificateUrl) {
    textLines.push(``, `Constancia para firmar (7 días): ${params.certificateUrl}`);
  }

  textLines.push(``, `Vigencia hasta: ${formatCl(params.expiresAt)}`);

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
  /** Portal de jefatura: dirección corta y clave del área. */
  portal?: { url: string; key: string } | null;
}

/**
 * Botón compatible con clientes de correo (Outlook, Gmail, apps móviles):
 * tabla con fondo en la celda y enlace en bloque, sin flexbox.
 */
function emailButton(href: string, label: string, background: string, color: string, border: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 6px;border-collapse:separate;">
    <tr>
      <td bgcolor="${background}" style="background:${background};border:1px solid ${border};border-radius:6px;">
        <a href="${href}" target="_blank" style="display:block;padding:8px 14px;font-size:12px;font-weight:600;color:${color};text-decoration:none;white-space:nowrap;">${label}</a>
      </td>
    </tr>
  </table>`;
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
          ${emailButton(f.link, "Abrir inducción", "#0f172a", "#ffffff", "#0f172a")}
          ${
            f.certificateUrl
              ? emailButton(f.certificateUrl, "Descargar constancia (PDF)", "#ecfdf5", "#047857", "#a7f3d0")
              : ""
          }
          <p style="margin:6px 0 0;font-size:10px;line-height:1.4;color:#64748b;text-align:left;">
            Enlace para compartir con el funcionario:<br/>
            <a href="${f.link}" style="font-family:monospace;color:#2563eb;word-break:break-all;">${f.link}</a>
          </p>
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

        ${
          params.portal
            ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 18px;margin:0 0 20px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1e3a8a;">Portal de su área (ideal para el laboratorio)</p>
          <p style="margin:0 0 10px;font-size:13px;color:#334155;">
            Vea en una sola página los accesos vigentes de su área (nombre, RUT, PIN, enlace y constancia). Escriba esta dirección en cualquier navegador e ingrese la clave:
          </p>
          <p style="margin:0 0 4px;font-size:16px;"><a href="${params.portal.url}" style="color:#1d4ed8;font-weight:700;">${params.portal.url.replace(/^https?:\/\//, "")}</a></p>
          <p style="margin:0;font-size:14px;color:#0f172a;">Clave de acceso: <strong style="font-family:monospace;font-size:18px;letter-spacing:.12em;">${params.portal.key}</strong></p>
          <p style="margin:8px 0 0;font-size:11px;color:#64748b;">La clave cambia con cada nuevo envío a su área. No la comparta fuera de la jefatura.</p>
        </div>`
            : ""
        }

        ${inductionStepsHtml(
          "Instrucciones para cada funcionario",
          params.funcionarios.some((f) => f.certificateUrl)
            ? "En el paso 6, la constancia de cada funcionario se descarga con el botón «Descargar constancia (PDF)» de la tabla."
            : undefined,
        )}

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
    ...(params.portal
      ? [``, `Portal de su área: ${params.portal.url}`, `Clave de acceso: ${params.portal.key}`]
      : []),
    ``,
    ...inductionStepsText("Instrucciones para cada funcionario:"),
    ``,
    `Vigencia hasta: ${formatCl(params.expiresAt)}`,
  ];

  return { subject, html, text: textLines.join("\n") };
}
