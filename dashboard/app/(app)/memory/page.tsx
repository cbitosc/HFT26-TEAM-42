"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarValue } from "@/components/charts";
import { CorrectionTrail } from "@/components/CorrectionTrail";
import { EntryAudit } from "@/components/EntryAudit";
import { MemoryLadder } from "@/components/MemoryLadder";
import { rippleChange } from "@/components/Ripple";
import { StatusBadge, TierBadge, useEntrance } from "@/components/ui";
import { SNAPSHOT_NOTE, bakedMemory, type MemoryEntry } from "@/lib/baked";
import { fetchMemory } from "@/lib/bridge";
import { useRuns } from "@/lib/store";

const TASKS = [...new Set(bakedMemory.map((entry) => entry.task_signature))];

export default function MemoryPage() {
  const { live } = useRuns();
  const [entries, setEntries] = useState<MemoryEntry[]>(bakedMemory);
  const [selected, setSelected] = useState<string | null>(null);
  const [task, setTask] = useState<string | null>(null);
  const [asList, setAsList] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { ref: entriesRef, entrance } = useEntrance<HTMLDivElement>(0);

  // Tier and confidence come from the bridge when it is connected. /memory has no evidence
  // history, so a live entry keeps whatever detail the baked registry already has.
  useEffect(() => {
    if (live !== "on") return;
    let cancelled = false;
    Promise.all(TASKS.map((task) => fetchMemory(task, 20)))
      .then((results) => {
        if (cancelled) return;
        const ranked = new Map(results.flat().map((r) => [r.entry_id, r]));
        setError(false);
        setEntries(bakedMemory.map((entry) => ({ ...entry, ...ranked.get(entry.entry_id) })));
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [live, attempt]);

  // ?entry=id opens that entry, so a link can go straight to it in the video or in Q&A.
  const restored = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("entry");
    if (id) setSelected(id);
  }, []);
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      return;
    }
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("entry", selected);
    else url.searchParams.delete("entry");
    window.history.replaceState(null, "", url);
  }, [selected]);

  const toggle = useCallback((id: string) => rippleChange(() => setSelected((current) => (current === id ? null : id))), []);
  const entry = useMemo(() => entries.find((item) => item.entry_id === selected), [entries, selected]);
  const visible = useMemo(() => (task ? entries.filter((item) => item.task_signature === task) : entries), [entries, task]);

  const filter = (next: string | null) =>
    rippleChange(() => {
      setTask(next);
      setSelected(null);
    });

  return (
    <div className="memory-page">
      <header className="page-head">
        <div>
          <h1>Memory</h1>
          <p>Lessons agents leave for each other. Trust rises as others reuse them. Cards marked avoid are mistakes the next agent is warned about.</p>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" className="btn" aria-pressed={asList} onClick={() => rippleChange(() => setAsList(!asList))}>
            View as list
          </button>
        </div>
      </header>
      {error ? (
        <p className="sample-note flex items-center gap-3">
          The IPFS gateway is slow. Showing the cached copy.
          <button type="button" className="btn" onClick={() => setAttempt(attempt + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      {live !== "on" ? <p className="sample-note">{SNAPSHOT_NOTE} Evidence is posted per run, so it credits every inherited entry, not only the ones that helped.</p> : null}
      <CorrectionTrail onOpen={setSelected} />
      <div className="memory-filter" role="group" aria-label="Filter by task">
        <button type="button" className="btn" aria-pressed={task === null} onClick={() => filter(null)}>
          All <span>{entries.length}</span>
        </button>
        {TASKS.map((name) => (
          <button key={name} type="button" className="btn" aria-pressed={task === name} onClick={() => filter(name)}>
            {name} <span>{entries.filter((item) => item.task_signature === name).length}</span>
          </button>
        ))}
      </div>
      <div className="memory-layout" data-open={Boolean(entry)}>
        <div ref={entriesRef} className="min-h-0 min-w-0 overflow-auto" data-entrance={entrance}>
          {asList ? (
            <table className="ledger">
              <thead>
                <tr className="label">
                  <th scope="col">Task</th>
                  <th scope="col">Entry</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.entry_id}>
                    <td className="mono">{item.task_signature}</td>
                    <td>
                      <button type="button" className="text-left underline underline-offset-2" onClick={() => toggle(item.entry_id)}>
                        {item.fix_summary}
                      </button>
                    </td>
                    <td>
                      <TierBadge tier={item.tier} />
                    </td>
                    <td className="min-w-32">
                      <BarValue value={item.confidence} max={1} text={item.confidence.toFixed(2)} />
                    </td>
                    <td>
                      <StatusBadge status={item.kind === "regression" ? "avoid" : item.verified && item.contradicted <= item.supported ? "verified" : "unverified"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <MemoryLadder entries={visible} selected={selected} onSelect={toggle} />
          )}
        </div>
        {entry ? <EntryAudit entry={entry} onClose={() => rippleChange(() => setSelected(null))} /> : null}
      </div>
    </div>
  );
}
