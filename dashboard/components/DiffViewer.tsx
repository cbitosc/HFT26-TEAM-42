"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { versionScores, type Diff, type RunState } from "@/lib/runState";
import { parseUnifiedDiff, toSplitRows, type DiffLine } from "@/lib/unifiedDiff";
import { stagger } from "./charts";
import { rippleChange, useRippleIn } from "./Ripple";
import { useEntrance } from "./ui";

const SIGN = { add: "+", del: "-", context: " " };
// Lines past this one wash in together, so a long diff does not keep the eye waiting.
const LAST_STAGGERED_LINE = 40;

const lineStagger = (i: number) => stagger(Math.min(i, LAST_STAGGERED_LINE));

function Cells({ line, side }: { line?: DiffLine; side: "left" | "right" }) {
  if (!line) {
    return (
      <>
        <td className="ln empty" />
        <td className="sign empty" />
        <td className="empty" />
      </>
    );
  }
  const className = line.kind === "context" ? "" : line.kind;
  return (
    <>
      <td className={`ln ${className}`}>{side === "left" ? line.oldNumber : line.newNumber}</td>
      <td className={`sign ${className}`}>{SIGN[line.kind]}</td>
      <td className={className}>{line.text}</td>
    </>
  );
}

function SplitDiff({ diff }: { diff: Diff }) {
  const hunks = useMemo(() => parseUnifiedDiff(diff.unifiedDiff), [diff]);
  return (
    <table className="diff-table" aria-label={`Split diff from ${diff.from} to ${diff.to}`}>
      <colgroup>
        <col style={{ width: 42 }} />
        <col style={{ width: 18 }} />
        <col />
        <col style={{ width: 42 }} />
        <col style={{ width: 18 }} />
        <col />
      </colgroup>
      <tbody>
        {hunks.map((hunk) => (
          <FragmentRows key={hunk.header} header={hunk.header}>
            {toSplitRows(hunk.lines).map((row, i) => (
              <tr key={i} style={lineStagger(i)}>
                <Cells line={row.left} side="left" />
                <Cells line={row.right} side="right" />
              </tr>
            ))}
          </FragmentRows>
        ))}
      </tbody>
    </table>
  );
}

function FragmentRows({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="hunk">
        <td colSpan={6}>{header}</td>
      </tr>
      {children}
    </>
  );
}

function UnifiedDiff({ diff }: { diff: Diff }) {
  const hunks = useMemo(() => parseUnifiedDiff(diff.unifiedDiff), [diff]);
  return (
    <table className="diff-table" aria-label={`Unified diff from ${diff.from} to ${diff.to}`}>
      <colgroup>
        <col style={{ width: 42 }} />
        <col style={{ width: 42 }} />
        <col style={{ width: 18 }} />
        <col />
      </colgroup>
      <tbody>
        {hunks.map((hunk) => (
          <FragmentRows key={hunk.header} header={hunk.header}>
            {hunk.lines.map((line, i) => {
              const className = line.kind === "context" ? "" : line.kind;
              return (
                <tr key={i} style={lineStagger(i)}>
                  <td className={`ln ${className}`}>{line.oldNumber}</td>
                  <td className={`ln ${className}`}>{line.newNumber}</td>
                  <td className={`sign ${className}`}>{SIGN[line.kind]}</td>
                  <td className={className}>{line.text}</td>
                </tr>
              );
            })}
          </FragmentRows>
        ))}
      </tbody>
    </table>
  );
}

// Its own component so the watchers start when the first diff arrives, which on a live run can be after the page.
function DiffBody({ diff, split }: { diff: Diff; split: boolean }) {
  const pane = useRippleIn<HTMLDivElement>(`${diff.to}-${split}`);
  const changes = useRippleIn<HTMLElement>(diff.to);
  const { ref, entrance } = useEntrance<HTMLDivElement>(0);

  return (
    <div ref={ref} className="diff-layout" data-entrance={entrance}>
      <div ref={pane} className="diff-pane">{split ? <SplitDiff diff={diff} /> : <UnifiedDiff diff={diff} />}</div>
      <aside ref={changes} className="changelog">
        <h2 className="label">What changed</h2>
        <ol>
          {diff.changelog.map((item, i) => (
            <li key={item} style={stagger(i)}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {item}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

export function DiffViewer({ run }: { run: RunState }) {
  const [index, setIndex] = useState(0);
  const [split, setSplit] = useState(true);
  const totals = new Map(versionScores(run).map((v) => [v.version, v.total]));
  const diff = run.diffs[Math.min(index, run.diffs.length - 1)];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{diff ? `Changes, ${diff.from} to ${diff.to}` : "No changes yet"}</h1>
          <p>What the agent rewrote between versions, and why.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="scrubber" role="group" aria-label="Choose a version step">
            {run.diffs.map((d, i) => (
              <button
                key={`${d.from}-${d.to}`}
                type="button"
                className="scrub-stop"
                aria-pressed={i === index}
                onClick={() => rippleChange(() => setIndex(i))}
              >
                {d.from} to {d.to}
                <span>
                  {totals.get(d.from)} / {totals.get(d.to)}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" className="btn" aria-pressed={split} onClick={() => rippleChange(() => setSplit(true))}>
              Split
            </button>
            <button type="button" className="btn" aria-pressed={!split} onClick={() => rippleChange(() => setSplit(false))}>
              Unified
            </button>
          </div>
        </div>
      </header>
      {diff ? (
        <DiffBody diff={diff} split={split} />
      ) : (
        <div className="grid justify-items-start gap-2 p-6">
          <p className="notice">The first diff appears when V2 has been scored.</p>
          <Link href={`/run/${run.id}`} className="btn">
            Back to the run
          </Link>
        </div>
      )}
    </>
  );
}
