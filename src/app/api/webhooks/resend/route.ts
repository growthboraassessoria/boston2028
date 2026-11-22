// Webhook do Resend (assinatura Svix). Só confirma entrega/devolução de e-mails que já estão na fila.
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { asService } from "@/lib/db";

export const dynamic = "force-dynamic";

function verify(secret: string, id: string, timestamp: string, body: string, signatures: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false; // janela de 5 min contra replay
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signature = req.headers.get("svix-signature") ?? "";
  const body = await req.text();
  if (!id || !verify(secret, id, timestamp, body, signature)) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  let event: { type?: string; data?: { email_id?: string } };
  try { event = JSON.parse(body); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!event.type || !event.data?.email_id) return NextResponse.json({ ok: true, ignored: true });
  await asService((tx) => tx`select rtb.outbox_provider_event('resend', ${id}, ${event.data!.email_id!}, ${event.type!}, ${tx.json({ type: event.type })})`);
  return NextResponse.json({ ok: true });
}
