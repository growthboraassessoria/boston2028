// Origem da visita (UTM, código de indicação, referrer). Cookie primário gravado no navegador pelo UtmCapture.
import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";

export const UTM_COOKIE = "rtb_utm";

const Short = z.string().trim().max(160).optional();
const Utm = z.object({
  source: Short, medium: Short, campaign: Short, term: Short, content: Short,
  referrer: z.string().trim().max(200).optional(),
  landing: z.string().trim().max(300).optional(),
  ref: z.string().trim().regex(/^[A-Za-z0-9_-]{3,40}$/).optional(),
});
export type UtmData = z.infer<typeof Utm>;

export async function readUtmCookie(): Promise<UtmData | null> {
  const raw = (await cookies()).get(UTM_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = Utm.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
