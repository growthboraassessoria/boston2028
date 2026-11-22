// Rotina: reenvia a fila de e-mails. Sem Resend configurado, não faz nada (fica "queued", sem falso envio).
import { NextResponse } from "next/server";
import { processOutbox } from "@/lib/email/outbox";
import { cronAuthorized } from "@/lib/server/cron";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await processOutbox(50);
  return NextResponse.json({ ok: true, ...r, at: new Date().toISOString() });
}
