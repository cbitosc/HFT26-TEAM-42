"use client";

import { useEffect, useRef, useState } from "react";
import { etherscanTx } from "@/lib/chain";
import { formatEth } from "@/lib/format";
import type { RunState } from "@/lib/runState";
import { useRuns } from "@/lib/store";
import { Glyph } from "./ui";

const MAX_TOASTS = 3;
const LIFE_MS = 6000;

interface Toast {
  id: number;
  text: string;
  href?: string;
  note?: string;
}

const settled = (runs: Record<string, RunState>) =>
  Object.values(runs).flatMap((run) =>
    run.proofs.filter((proof) => proof.step >= 4 && !proof.failed).map((proof) => ({ run, proof, key: `${run.id}:${proof.from}-${proof.to}` })),
  );

// Only the two chain moments worth interrupting for. Runs already finished on load stay quiet.
export function Toasts() {
  const { runs, offChain } = useRuns();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    const current = settled(runs);
    const known = seen.current;
    seen.current = new Set(current.map((item) => item.key));
    if (!known) return;

    const fresh = current
      .filter((item) => !known.has(item.key))
      .flatMap(({ run, proof }) => {
        const simulated = offChain(run.id);
        const shared = {
          href: !simulated && proof.tx ? proof.etherscanUrl || etherscanTx(proof.tx) : undefined,
          note: simulated ? "Simulated, no transaction" : undefined,
        };
        const items = [{ ...shared, text: `Proof verified, ${proof.from} to ${proof.to}` }];
        if (proof.rewardWei) items.push({ ...shared, text: `Reward paid: ${formatEth(String(proof.rewardWei))}` });
        return items.map((item) => ({ ...item, id: nextId.current++ }));
      });
    if (!fresh.length) return;

    setToasts((list) => [...list, ...fresh].slice(-MAX_TOASTS));
    fresh.forEach((toast) => setTimeout(() => setToasts((list) => list.filter((item) => item.id !== toast.id)), LIFE_MS));
  }, [runs, offChain]);

  return (
    <ul className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <li key={toast.id}>
          {toast.href ? (
            <a href={toast.href} target="_blank" rel="noreferrer">
              {toast.text}
              <Glyph name="external" size={12} />
            </a>
          ) : (
            toast.text
          )}
          {toast.note ? <span className="notice">{toast.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}
