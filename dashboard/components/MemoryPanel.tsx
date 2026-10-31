"use client";

import { useState } from "react";
import { entryById } from "@/lib/baked";
import type { InheritedEntry } from "@/lib/events";
import type { RunState } from "@/lib/runState";
import { stagger } from "./charts";
import { rippleChange } from "./Ripple";
import { TierBadge } from "./ui";

// docs/02 has no kind on memory.retrieved, so fall back to the registry entry for older recordings.
const isAvoid = (entry: InheritedEntry) =>
  (entry.kind ?? entryById(entry.entry_id)?.kind) === "regression" || /^avoid/i.test(entry.summary);

function Item({ entry, position }: { entry: InheritedEntry; position: number }) {
  const [open, setOpen] = useState(false);
  const hypothesis = entryById(entry.entry_id)?.hypothesis;
  return (
    <button
      type="button"
      className="mem-item"
      style={stagger(position)}
      aria-expanded={open}
      onClick={() => rippleChange(() => setOpen(!open))}
      title={hypothesis ?? entry.summary}
    >
      <span className="mem-item-top">
        <TierBadge tier={entry.tier} />
        <span className="notice">{entry.confidence.toFixed(2)}</span>
      </span>
      <p className={open ? undefined : "mem-summary"}>{entry.summary}</p>
      {open && hypothesis ? <p className="notice">{hypothesis}</p> : null}
      <span className="meter" style={{ display: "block" }} aria-label={`Confidence ${entry.confidence.toFixed(2)}`}>
        <i style={{ width: `${entry.confidence * 100}%` }} />
      </span>
      <div className="mem-reflection" aria-hidden="true">
        {entry.summary}
      </div>
    </button>
  );
}

export function MemoryPanel({ run }: { run: RunState }) {
  const lessons = run.memory.filter((entry) => !isAvoid(entry));
  const avoid = run.memory.filter(isAvoid);

  return (
    <aside className="side frost memory-rail" aria-label="Memory">
      <section className="side-section">
        <h2 className="label">
          Lessons <span>{lessons.length}</span>
        </h2>
        {lessons.length ? lessons.map((entry, i) => <Item key={entry.entry_id} entry={entry} position={i} />) : <p className="notice">No entries match this task yet.</p>}
      </section>
      <section className="side-section">
        <h2 className="label">
          Avoid <span>{avoid.length}</span>
        </h2>
        {avoid.length ? (
          avoid.map((entry, i) => <Item key={entry.entry_id} entry={entry} position={lessons.length + i} />)
        ) : (
          <p className="notice">No failures on record for this task.</p>
        )}
      </section>
    </aside>
  );
}
