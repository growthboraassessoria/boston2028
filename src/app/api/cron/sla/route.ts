// Rotina diária: SLA do "Quase lá" (aviso e atraso, uma vez cada), lembretes da cadência e vencimento de códigos.
import { NextResponse } from "next/server";
import { asService } from "@/lib/db";
import { cronAuthorized } from "@/lib/server/cron";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await asService(async (tx) => {
    const [sla] = await tx`select rtb.sla_tick() as r`;
    const [exp] = await tx`select rtb.expire_redemptions() as n`;
    return { sla: sla!.r, expired_redemptions: exp!.n };
  });
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}
