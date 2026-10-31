"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bakedRuns } from "@/lib/baked";
import { formatDay } from "@/lib/format";
import { applyEvent, emptyRun, isVerified, versionScores } from "@/lib/runState";
import { useRuns } from "@/lib/store";
import { rippleChange } from "./Ripple";
import { Glyph } from "./ui";

// Read from the recordings, not the store, where a run is blank while it replays. A run counts when it
// finished and the version it kept has a proof verified on-chain, which leaves out simulated proofs.
const SUCCESSFUL = bakedRuns.flatMap(({ id, title, events }) => {
  const run = events.reduce(applyEvent, emptyRun(id));
  const scores = versionScores(run);
  const kept = scores.find((version) => version.version === run.finalVersion);
  if (run.phase !== "finished" || !kept || !isVerified(run, kept.version)) return [];
  return [{ id, title, from: scores[0].total, to: kept.total, day: formatDay(events[0].ts) }];
});

export function ReplayMenu() {
  const router = useRouter();
  const { playback, restart } = useRuns();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const replay = (id: string) => {
    setOpen(false);
    rippleChange(() => restart(id));
    router.push(`/run/${id}`);
  };

  return (
    <div ref={root} className="replay">
      <button ref={trigger} type="button" className="toggle inline-flex items-center gap-1.5" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Glyph name="play" size={11} />
        Replay a run
      </button>
      {open ? (
        <div className="replay-panel">
          <h2 className="label">Successful runs</h2>
          <ul>
            {SUCCESSFUL.map(({ id, title, from, to, day }) => (
              <li key={id}>
                <button type="button" className="replay-run" onClick={() => replay(id)}>
                  <span className="replay-title">
                    {title}
                    {playback.runId === id && playback.playing ? <span className="notice">Playing</span> : null}
                  </span>
                  <span className="replay-score">
                    <span>
                      {from} to {to}
                    </span>
                    <b>
                      <Glyph name="tick" size={12} />+{to - from}
                    </b>
                    <span className="notice">{day}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
