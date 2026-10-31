"use client";

import { runStatus, type RunState } from "@/lib/runState";
import { useRuns } from "@/lib/store";
import { OFFLINE_NOTE } from "./ui";

// The one live region for the run view: what is happening now, and how far to trust it.
export function RunStatus({ run }: { run: RunState }) {
  const { playback, live, liveRuns, sourceOf } = useRuns();
  const replaying = playback.runId === run.id && playback.playing;
  const lost = liveRuns.includes(run.id) && live === "lost";
  const latest = run.regressions[run.regressions.length - 1];

  return (
    <div className="run-status" role="status" aria-live="polite">
      <p className="run-status-now">{runStatus(run)}</p>
      {latest ? (
        <p className="notice" data-tone="regression">
          {latest.to} scored lower than {latest.from}, so {latest.from} was kept. Saved as an Avoid entry.
        </p>
      ) : null}
      {lost ? <p className="notice">Lost the live stream. Reconnecting.</p> : null}
      {replaying ? <p className="notice">Replaying a recorded run</p> : null}
      {sourceOf(run.id) === "baked" ? <p className="notice">Sample data. No transaction exists.</p> : run.baked ? <p className="notice">{OFFLINE_NOTE}</p> : null}
      {run.order.length ? <p className="notice">Select any step for details.</p> : null}
    </div>
  );
}
