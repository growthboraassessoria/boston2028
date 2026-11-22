// Processa a fila rtb.email_outbox. Sem RESEND_API_KEY: nada é "enviado" (fica em fila, com aviso no OS).
import "server-only";
import { asService } from "@/lib/db";
import { renderEmail, type TemplateRow } from "./render";

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}

type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendViaResend(to: string, subject: string, html: string, text: string, idempotencyKey: string): Promise<SendResult> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (r.ok && j.id) return { ok: true, id: j.id };
    return { ok: false, error: `resend ${r.status}: ${j.name ?? ""} ${j.message ?? ""}`.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: `rede: ${(e as Error).message}`.slice(0, 300) };
  }
}

export async function processOutbox(limit = 20): Promise<{ processed: number; accepted: number; failed: number; skipped?: string }> {
  if (!emailConfigured()) return { processed: 0, accepted: 0, failed: 0, skipped: "integration_pending" };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3530";
  const batch = await asService((tx) => tx`select * from rtb.outbox_claim(${limit})`);
  let accepted = 0, failed = 0;
  for (const row of batch) {
    const [t] = await asService((tx) => tx`select key, subject, preheader, body, cta_label, cta_path from rtb.message_templates where key = ${row.template_key}`);
    if (!t) {
      await asService((tx) => tx`select rtb.outbox_result(${row.id}, false, 'resend', null, 'template_missing')`);
      failed++;
      continue;
    }
    const mail = renderEmail(t as unknown as TemplateRow, row.variables ?? {}, site);
    const r = await sendViaResend(row.to_email, mail.subject, mail.html, mail.text, `rtb-${row.id}`);
    await asService((tx) => tx`select rtb.outbox_result(${row.id}, ${r.ok}, 'resend', ${r.ok ? r.id : null}, ${r.ok ? null : r.error})`);
    if (r.ok) accepted++; else failed++;
  }
  return { processed: batch.length, accepted, failed };
}

/** Disparo logo depois de uma ação (em segundo plano). A rotina diária cobre falhas e reenvios. */
export async function processOutboxSoon() {
  try {
    await processOutbox(5);
  } catch (e) {
    console.error("[outbox]", (e as Error).message);
  }
}
