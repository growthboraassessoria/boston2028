"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimBenefit } from "@/lib/actions/benefits";
import { Button } from "@/components/ui/Button";
import { CheckRow } from "@/components/forms/fields";

export function ClaimBenefit({ benefitId, title }: { benefitId: string; title: string }) {
  const router = useRouter();
  const key = useRef<string | null>(null); // gerada no 1º clique e reaproveitada em novas tentativas
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      <CheckRow id="accept-terms" checked={accepted} onChange={setAccepted}>
        Li as regras e os termos de “{title}” e entendo que o código é pessoal e vale uma única vez.
      </CheckRow>
      <Button size="lg" disabled={!accepted || pending} onClick={() => start(async () => {
        setError(null);
        key.current ??= (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
        const r = await claimBenefit(benefitId, accepted, key.current);
        if (r.ok) router.push(`/passport/resgates?novo=${(r.data as { redemption_id: string }).redemption_id}`);
        else setError(r.error);
      })}>
        {pending ? "Resgatando…" : "Resgatar"}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
