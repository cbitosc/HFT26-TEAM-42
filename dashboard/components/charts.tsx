"use client";

import { AXES, MAX_TOTAL, WEIGHTS, totalScore } from "@/lib/format";
import { CountUp, Glyph, useEntrance, type GlyphName } from "./ui";

// Position in a staggered entrance. app/styles/entrance.css and proof.css turn it into a delay.
export const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

const CLIMB_GAP = 0.38;

export interface MirrorRow {
  name: string;
  off: number;
  on: number;
  // The difference in words, shown beside the with-memory value.
  gain?: string;
  strong?: boolean;
}

const tones = ({ off, on }: MirrorRow, lowerIsBetter: boolean) => {
  if (off === on) return { off: undefined, on: undefined };
  const onWins = on > off !== lowerIsBetter;
  return { off: onWins ? "worse" : "better", on: onWins ? "better" : "worse" };
};

// Two arms growing out from one seam, green for the better value and red for the lesser.
export function MirrorChart({
  rows,
  max,
  label,
  reach = 86,
  seam,
  heads = false,
  lowerIsBetter = false,
}: {
  rows: MirrorRow[];
  max: number;
  label: string;
  reach?: number;
  seam?: number;
  heads?: boolean;
  lowerIsBetter?: boolean;
}) {
  const width = (value: number) => (value / max) * reach;
  const style = seam ? ({ "--seam": `${seam}px` } as React.CSSProperties) : undefined;
  const { ref, entrance } = useEntrance<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="ab-chart" style={style} data-entrance={entrance} role="img" aria-label={label}>
      {heads ? (
        <div className="ab-row ab-heads label">
          <span>Without memory</span>
          <span />
          <span>With memory</span>
        </div>
      ) : null}
      {rows.map((row, i) => {
        const tone = tones(row, lowerIsBetter);
        return (
          <div className="ab-row" key={row.name} style={stagger(i)} data-strong={row.strong || undefined}>
            <div className="ab-bar" data-side="left" data-tone={tone.off}>
              <i style={{ width: `${width(row.off)}%` }} />
              <b style={{ right: `calc(${width(row.off)}% + 8px)` }}>{row.off}</b>
            </div>
            <span className="label">{row.name}</span>
            <div className="ab-bar" data-side="right" data-tone={tone.on}>
              <i style={{ width: `${width(row.on)}%` }} />
              <b style={{ left: `calc(${width(row.on)}% + 8px)` }}>
                {row.on}
                {row.gain ? <span>{row.gain}</span> : null}
              </b>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Click a total to see every step behind it, using the circuit's own weights.
export function WhyScore({ scores, align, children }: { scores: readonly number[]; align?: "right"; children: React.ReactNode }) {
  return (
    <details className="why" data-align={align}>
      <summary>
        {children}
        <span className="why-hint">why this score</span>
      </summary>
      <div className="why-panel">
        <table>
          <tbody>
            {AXES.map((axis, i) => (
              <tr key={axis}>
                <th scope="row">{axis}</th>
                <td>
                  {scores[i]} x {WEIGHTS[i]}
                </td>
                <td>{scores[i] * WEIGHTS[i]}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">total</th>
              <td />
              <td>{totalScore(scores)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}

// A number that also shows how full its scale is.
export function BarValue({ value, max, text }: { value: number; max: number; text?: string }) {
  return (
    <span className="bar-value mono">
      <span className="meter" aria-hidden="true">
        <i style={{ width: `${(value / max) * 100}%` }} />
      </span>
      {text ?? value}
    </span>
  );
}

export type ClimbTone = "verified" | "pending" | "regression";

export interface ClimbStep {
  version: string;
  total: number;
  // The score this version is measured against, absent for the first.
  from?: number;
  tone?: ClimbTone;
}

const CLIMB_TONES: Record<ClimbTone, { glyph: GlyphName; text: string }> = {
  verified: { glyph: "tick", text: "Proven gain" },
  pending: { glyph: "hourglass", text: "Gain, proof not finished" },
  regression: { glyph: "crack", text: "Lost, version not kept" },
};

const share = (score: number) => `${(score / MAX_TOTAL) * 100}%`;

// The whole run as a staircase, on the full score scale. The block on top of each step is what that version changed.
export function ScoreClimb({ steps }: { steps: ClimbStep[] }) {
  const tones = (Object.keys(CLIMB_TONES) as ClimbTone[]).filter((tone) => steps.some((step) => step.tone === tone));
  return (
    <figure className="climb">
      <figcaption>
        <span className="label">Score across the run, out of {MAX_TOTAL}</span>
        <ul className="climb-key">
          {tones.map((tone) => (
            <li key={tone}>
              <i data-tone={tone} />
              {CLIMB_TONES[tone].text}
            </li>
          ))}
        </ul>
      </figcaption>
      <div
        className="climb-plot"
        role="img"
        aria-label={steps.map((step) => `${step.version} scored ${step.total}${step.tone ? `, ${CLIMB_TONES[step.tone].text.toLowerCase()}` : ""}`).join(". ")}
      >
        {steps.map(({ version, total, from, tone }, i) => {
          const change = from === undefined ? undefined : total - from;
          const floor = Math.min(total, from ?? total);
          const top = Math.max(total, from ?? total);
          return (
            <div className="climb-step" key={version} style={stagger(i)}>
              <div className="climb-column">
                <i className="climb-base" style={{ height: share(floor) }} />
                {tone ? <i className="climb-change" data-tone={tone} style={{ bottom: share(floor), height: share(top - floor) }} /> : null}
                <div className="climb-value" style={{ bottom: share(top) }}>
                  <b className="display">
                    <CountUp value={total} from={from ?? 0} delay={i * CLIMB_GAP} />
                  </b>
                  {tone && change !== undefined ? (
                    <span data-tone={tone}>
                      <Glyph name={CLIMB_TONES[tone].glyph} size={12} />
                      {change > 0 ? `+${change}` : change}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="label">{version}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

// Each axis on the same 0 to 100 rail, with the points gained in green or lost in red.
export function ScoreShift({ from, to }: { from: readonly number[]; to: readonly number[] }) {
  return (
    <ul className="shift">
      {AXES.map((axis, i) => (
        <li key={axis} title={`${axis}: ${from[i]} to ${to[i]}`} style={stagger(i)}>
          <span className="shift-name">{axis}</span>
          <span className="shift-rail" aria-hidden="true">
            <i style={{ left: 0, width: `${Math.min(from[i], to[i])}%` }} />
            <i data-tone={to[i] > from[i] ? "better" : "worse"} style={{ left: `${Math.min(from[i], to[i])}%`, width: `${Math.abs(to[i] - from[i])}%` }} />
          </span>
          <span className="mono">
            {from[i]} to {to[i]}
          </span>
        </li>
      ))}
    </ul>
  );
}
