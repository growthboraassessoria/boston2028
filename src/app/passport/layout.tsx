import type { Metadata } from "next";
import { PassportShell } from "@/components/passport/PassportShell";
import { getPassport } from "@/lib/data/passport";

export const metadata: Metadata = { title: "Boston Passport", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PassportLayout({ children }: { children: React.ReactNode }) {
  const d = await getPassport();
  return <PassportShell passportNumber={d.profile.passportNumber} unread={d.unread}>{children}</PassportShell>;
}
