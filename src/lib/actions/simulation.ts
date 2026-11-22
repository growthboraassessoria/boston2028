"use server";

// Grava a simulação do Boston Index Lab de forma anônima (sem nome, sem e-mail, sem IP guardado).
// Repetir a mesma simulação não cria linha nova (chave de idempotência = hash do visitante + entradas).
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { asService, dbErrorCode } from "@/lib/db";
import { getOrSetAnonKey } from "@/lib/server/anon";

const Input = z.object({
  birthDate: z.iso.date(),
  category: z.enum(["M", "F", "X", "OTHER"]),
  distance: z.enum(["MARATHON", "HALF"]),
  seconds: z.number().int().min(3300).max(32400),
  markDate: z.iso.date(),
  raceName: z.string().trim().max(120).optional(),
});

export type SaveSimulationResult = { ok: true; simulationId: string } | { ok: false; error: string };

export async function saveSimulation(raw: unknown): Promise<SaveSimulationResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const input = parsed.data;
  const key = await getOrSetAnonKey();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  const ipBucket = createHash("sha256").update(`rtb:${ip}`).digest("base64url").slice(0, 32);
  const idem = createHash("sha256").update(JSON.stringify([key, input])).digest("base64url").slice(0, 40);
  try {
    return await asService(async (tx) => {
      const [allowed] = await tx`select rtb.hit_rate_limit(${"sim:" + ipBucket}, 60, 3600) as ok`;
      if (!allowed?.ok) return { ok: false as const, error: "rate_limited" };
      const [row] = await tx`select rtb.save_simulation(${input.birthDate}::date, ${input.category}, ${input.distance},
        ${input.seconds}, ${input.markDate}::date, ${input.raceName ?? null}, ${key}, ${idem}, null, null) as r`;
      return { ok: true as const, simulationId: (row!.r as { simulation_id: string }).simulation_id };
    });
  } catch (e) {
    return { ok: false, error: dbErrorCode(e) };
  }
}
