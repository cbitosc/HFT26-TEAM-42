import { useMemo } from "react";
import type { MemoryEntry } from "@/lib/baked";
import type { Tier } from "@/lib/events";
import { BarValue, stagger } from "./charts";
import { Glyph, TierBadge } from "./ui";

// Top rung first, so trust reads as rising. Rules mirror _nextTier in MemoryRegistry.sol.
const RUNGS: { tier: Tier; rule: string }[] = [
  { tier: "canonical", rule: "3 net reuses" },
  { tier: "trusted", rule: "2 net reuses" },
  { tier: "validated", rule: "1 net reuse" },
  { tier: "candidate", rule: "New, no net reuse yet" },
];

const isBad = (entry: MemoryEntry) => !entry.verified || entry.contradicted > entry.supported;

const warning = (entry: MemoryEntry) => {
  if (entry.kind === "regression") return "avoid";
  return entry.contradicted > entry.supported ? "disputed" : "unverified";
};

// Only entries from the two recorded runs go unmarked.
export const ORIGIN_LABEL = { run: null, rehearsal: "rehearsal", attestation: "A/B result", planted: "planted test" } as const;

const reuse = ({ supported, contradicted }: MemoryEntry) => {
  const parts = [];
  if (supported) parts.push(`${supported} ${supported === 1 ? "reuse" : "reuses"}`);
  if (contradicted) parts.push(`${contradicted} contradicted`);
  return parts.join(", ") || "No reuse yet";
};

function EntryCard({
  entry,
  link,
  selected,
  onSelect,
}: {
  entry: MemoryEntry;
  link: string | null;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const bad = isBad(entry);
  return (
    <button
      type="button"
      className="ladder-card"
      data-tier={entry.tier}
      data-bad={bad}
      aria-pressed={selected}
      onClick={() => onSelect(entry.entry_id)}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="label">{entry.task_signature}</span>
        <span className="flex items-center gap-2">
          {ORIGIN_LABEL[entry.origin] ? <span className="notice">{ORIGIN_LABEL[entry.origin]}</span> : null}
          {bad ? (
            <span className="badge" data-tone="regression">
              <Glyph name="crack" size={12} />
              {warning(entry)}
            </span>
          ) : null}
        </span>
      </span>
      <span className="ladder-summary">{entry.fix_summary}</span>
      {link ? <span className="ladder-link">{link}</span> : null}
      <span className="ladder-foot">
        <BarValue value={entry.confidence} max={1} text={entry.confidence.toFixed(2)} />
        <span className="notice">{reuse(entry)}</span>
      </span>
    </button>
  );
}

export function MemoryLadder({
  entries,
  selected,
  onSelect,
}: {
  entries: MemoryEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  // The supersedes link, written out in both directions.
  const links = useMemo(() => {
    const summaries = new Map(entries.map((entry) => [entry.entry_id, entry.fix_summary]));
    const written = new Map<string, string>();
    for (const entry of entries) {
      const older = entry.supersedes && summaries.get(entry.supersedes);
      if (!older) continue;
      written.set(entry.entry_id, `Replaces: ${older}`);
      written.set(entry.supersedes as string, `Replaced by: ${entry.fix_summary}`);
    }
    return written;
  }, [entries]);

  return (
    <div className="ladder">
      {RUNGS.map(({ tier, rule }, r) => {
        const rung = entries
          .filter((entry) => entry.tier === tier)
          .sort((a, b) => Number(isBad(a)) - Number(isBad(b)) || b.confidence - a.confidence);
        // Builds from the bottom rung, so the entrance climbs the way trust does.
        const climb = (RUNGS.length - 1 - r) * 2;
        return (
          <section className="ladder-rung" key={tier} style={stagger(climb)} aria-label={`${tier}, ${rung.length} entries`}>
            <div>
              <h2 className="ladder-tier">
                <TierBadge tier={tier} />
                <span className="notice">{rung.length}</span>
              </h2>
              <p className="notice m-0">{rule}</p>
            </div>
            {rung.length ? (
              <ul className="ladder-cards">
                {rung.map((entry, i) => (
                  <li key={entry.entry_id} style={stagger(climb + i)}>
                    <EntryCard
                      entry={entry}
                      link={links.get(entry.entry_id) ?? null}
                      selected={selected === entry.entry_id}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice m-0">No entries at this tier.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
