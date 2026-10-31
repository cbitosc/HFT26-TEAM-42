"use client";

import { useRuns } from "@/lib/store";
import { rippleChange } from "./Ripple";
import { Glyph } from "./ui";

const SPEEDS = [2, 4, 8];

// Replay controls for a recorded or baked run. Live runs have nothing to rewind.
export function Transport({ runId }: { runId: string }) {
  const { playback, restart, pause, resume, setSpeed, liveRuns } = useRuns();
  if (liveRuns.includes(runId)) return null;

  const current = playback.runId === runId;
  const inProgress = current && playback.position < playback.length;

  return (
    <div className="canvas-transport">
      {inProgress ? (
        <button type="button" className="btn" onClick={playback.playing ? pause : resume}>
          <Glyph name={playback.playing ? "pause" : "play"} />
          {playback.playing ? "Pause" : "Resume"}
        </button>
      ) : null}
      <button type="button" className="btn" onClick={() => rippleChange(() => restart(runId))}>
        <Glyph name={current ? "restart" : "play"} />
        {current ? "Restart" : "Watch this run"}
      </button>
      {SPEEDS.map((speed) => (
        <button
          key={speed}
          type="button"
          className="btn"
          aria-pressed={playback.speed === speed}
          aria-label={`Speed ${speed} times`}
          onClick={() => setSpeed(speed)}
        >
          x{speed}
        </button>
      ))}
      {inProgress ? (
        <span className="notice">
          {playback.position}/{playback.length}
        </span>
      ) : null}
    </div>
  );
}
