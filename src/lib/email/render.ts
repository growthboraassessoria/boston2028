// Layout dos e-mails transacionais (pt-BR, acessível, marca BORA, sem imagem obrigatória).
// Variáveis {{chave}} sempre escapadas. Texto simples também é gerado.

export type TemplateRow = { key: string; subject: string; preheader: string | null; body: string; cta_label: string | null; cta_path: string | null };

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function fill(text: string, vars: Record<string, unknown>, escape: boolean) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    const s = v === null || v === undefined ? "" : String(v);
    return escape ? esc(s) : s;
  });
}

export function renderEmail(t: TemplateRow, vars: Record<string, unknown>, siteUrl: string) {
  const subject = fill(t.subject, vars, false).replace(/[\r\n]+/g, " ").slice(0, 160);
  const preheader = t.preheader ? fill(t.preheader, vars, true) : "";
  const paragraphs = t.body.replace(/\\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const ctaUrl = t.cta_path ? new URL(t.cta_path, siteUrl).toString() : null;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f2ec;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#0a1324">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#071c3c;padding:22px 28px">
<p style="margin:0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#ceff00;font-weight:700">BORA · Road to Boston 2028</p>
</td></tr>
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0a1324">${esc(subject)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#22304a">${fill(esc(p), vars, true).replace(/\n/g, "<br>")}</p>`).join("\n")}
${ctaUrl && t.cta_label ? `<p style="margin:22px 0 8px"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#071c3c;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:8px">${esc(t.cta_label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #e9e5da">
<p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">Projeto independente da BORA Assessoria. Não afiliado nem endossado pela Boston Athletic Association. Você recebe este e-mail porque tem um Boston Passport.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [subject, "", ...paragraphs.map((p) => fill(p, vars, false)), ctaUrl && t.cta_label ? `${t.cta_label}: ${ctaUrl}` : "", "",
    "Projeto independente da BORA Assessoria. Não afiliado nem endossado pela Boston Athletic Association."].join("\n");
  return { subject, html, text };
}
