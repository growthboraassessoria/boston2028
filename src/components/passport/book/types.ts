import type { StatusView } from "@/lib/domain/athlete-status";

export type BookData = {
  firstName: string;
  fullName: string;
  city: string | null;
  uf: string | null;
  passportNumber: string;
  issuedAt: string;
  categoryLabel: string;
  ageGroup: string | null;
  membershipLabel: string;
  status: StatusView;
  qrUrl: string;
  avatarUrl: string | null;
  journey: {
    kind: "ROAD_TO_BOSTON" | "BORA_NEXT" | null;
    enrollmentStatus: string | null;
    coachName: string | null;
    message: string | null;
    targetRace: string | null;
    targetRaceDate: string | null;
    targetRaceConfirmed: boolean;
    steps: { label: string; state: "done" | "current" | "todo" }[];
  };
  stamps: { slug: string; name: string; kind: "stamp" | "seal" | "milestone"; date: string }[];
  upcomingStamps: string[];
  evolution: {
    unlocked: boolean;
    best: { label: string; time: string; pace: string; date: string } | null;
    reference: string | null;
    gap: string | null;
    points: { label: string; seconds: number; kind: "mark" | "test" }[];
    referenceSeconds: number | null;
    nextReassessment: string | null;
    goals: { title: string; detail: string }[];
  };
  benefits: { availableCount: number; top: { slug: string; title: string; partner: string; locked: string | null }[]; redemptions: number };
};
