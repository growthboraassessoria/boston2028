import type { Metadata } from "next";
import { OsShell } from "@/components/os/OsShell";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: { default: "BORA OS · RTB 2028", template: "%s · OS RTB 2028" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const [dir] = await asUser(ctx.user, (tx) => tx`select display_name from rtb.staff_directory where user_id = ${ctx.user.id}`);
  return <OsShell roles={[...new Set(ctx.roles.map((r) => r.role))]} name={dir?.display_name ?? ctx.user.email}>{children}</OsShell>;
}
