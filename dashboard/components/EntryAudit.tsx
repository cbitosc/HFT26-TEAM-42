"use client";

import { useEffect, useRef } from "react";
import type { MemoryEntry } from "@/lib/baked";
import { etherscanAddress, etherscanTx } from "@/lib/chain";
import { formatTime, ipfsUrl, promptBlock, totalScore } from "@/lib/format";
import { BarValue, ScoreShift } from "./charts";
import { ORIGIN_LABEL } from "./MemoryLadder";
import { useRippleIn } from "./Ripple";
import { Glyph, HashChip, StatusBadge, TierBadge } from "./ui";

export function EntryAudit({ entry, onClose }: { entry: MemoryEntry; onClose: () => void }) {
  const panel = useRippleIn<HTMLElement>(entry.entry_id);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), [entry.entry_id]);

  return (
    <aside
      ref={panel}
      className="side frost inspector"
      aria-label="Audit trail"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <section className="side-section">
        <h2 className="label">
          Audit trail
          <button ref={close} type="button" onClick={onClose} aria-label="Close audit trail">
            <Glyph name="cross" size={13} />
          </button>
        </h2>
        <p className="m-0 mb-2 text-[15px] leading-snug">{entry.hypothesis}</p>
        <div className="flex flex-wrap gap-3">
          <TierBadge tier={entry.tier} />
          <StatusBadge status={entry.kind === "regression" ? "avoid" : entry.verified ? "verified" : "unverified"} />
          {ORIGIN_LABEL[entry.origin] ? <span className="notice">{ORIGIN_LABEL[entry.origin]}</span> : null}
        </div>
      </section>
      <section className="side-section">
        <dl className="kv">
          <dt>author</dt>
          <dd>
            <HashChip value={entry.author} href={etherscanAddress(entry.author)} />
          </dd>
          <dt>cid</dt>
          <dd>
            <HashChip value={entry.cid} href={ipfsUrl(entry.cid)} />
          </dd>
          <dt>tx</dt>
          <dd>
            <HashChip value={entry.tx} href={etherscanTx(entry.tx)} />
          </dd>
          <dt>scores</dt>
          <dd className="mono">
            {totalScore(entry.scores.old)} to {totalScore(entry.scores.new)}
          </dd>
          <dt>confidence</dt>
          <dd>
            <BarValue value={entry.confidence} max={1} text={entry.confidence.toFixed(2)} />
          </dd>
          <dt>failure</dt>
          <dd>{entry.failure_pattern}</dd>
        </dl>
      </section>
      <section className="side-section">
        <h2 className="label">Scores by axis</h2>
        <ScoreShift from={entry.scores.old} to={entry.scores.new} />
      </section>
      <section className="side-section">
        <h2 className="label">Evidence</h2>
        {entry.evidence.length ? (
          <ul>
            {entry.evidence.map((item) => (
              <li key={item.tx} className="border-t border-white/10 py-2">
                <StatusBadge status={item.supported ? "held" : "notHeld"} />
                <p className="m-0 mt-1 text-[13px] leading-snug">{item.note}</p>
                <p className="notice m-0">{formatTime(item.ts)}</p>
                <HashChip value={item.tx} href={etherscanTx(item.tx)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">No reuse recorded yet.</p>
        )}
      </section>
      <section className="side-section">
        <details className="raw">
          <summary>What the next agent received</summary>
          <pre>{promptBlock(entry.kind, entry.tier, `${entry.task_signature}: ${entry.fix_summary}`)}</pre>
        </details>
      </section>
      <section className="side-section">
        <h2 className="label">Tier history</h2>
        <ul>
          {entry.promotions.map((step) => (
            <li key={`${step.tier}-${step.ts}`} className="flex justify-between gap-2 py-1">
              <TierBadge tier={step.tier} />
              <span className="notice">{formatTime(step.ts).slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
