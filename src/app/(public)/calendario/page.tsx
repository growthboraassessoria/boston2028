import type { Metadata } from "next";
import { getCalendar } from "@/lib/data/public";
import { CalendarSection, TestsGamification } from "@/components/landing/Sections";

export const revalidate = 300;
export const metadata: Metadata = { title: "Calendário", description: "Etapas do Road to Boston 2028, com o status de cada data." };

export default async function CalendarioPage() {
  const items = await getCalendar();
  return (
    <>
      <CalendarSection items={items} intro />
      <TestsGamification />
    </>
  );
}
