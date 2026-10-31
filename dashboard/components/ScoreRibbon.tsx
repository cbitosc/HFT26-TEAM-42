"use client";

import { AXES, WEIGHTS } from "@/lib/format";
import { isRegressed, isVerified, versionScores, type RunState, type VersionScore } from "@/lib/runState";
import { WhyScore, stagger } from "./charts";
import { CountUp, Develop, Glyph } from "./ui";

const VERSION_COLOR = ["var(--v1)", "var(--v2)", "var(--v3)"];

export function ScoreRibbon({ run }: { run: RunState }) {
  const versions = versionScores(run);
  const good = versions.filter((v) => !isRegressed(run, v.version));
  const latest = good[good.length - 1];
  const first = versions[0];
  const gain = latest && first ? latest.total - first.total : 0;
  const verified = latest ? isVerified(run, latest.version) : false;
  const color = (v: VersionScore, i: number) => (isRegressed(run, v.version) ? "var(--regression)" : VERSION_COLOR[i] ?? VERSION_COLOR[2]);

  return (
    <section className="ribbon" aria-label="Scores by version">
      <div className="ribbon-meta">
        <span className="label">{run.agentId === "agentB" ? "Agent B" : "Agent A"}</span>
        <strong>{run.task || "Waiting for a run"}</strong>
        <span className="notice">Memory {run.memoryEnabled ? "on" : "off"}</span>
      </div>
      {AXES.map((axis, a) => (
        <div className="axis" key={axis} style={stagger(a)}>
          <div className="axis-head">
            <span className="label">{axis}</span>
            <span className="axis-value">{latest ? <CountUp value={latest.scores[a]} from={0} /> : "-"}</span>
          </div>
          <div className="rail" title={`Weight ${WEIGHTS[a]}`}>
            {versions.map((v, i) => (
              <i key={v.version} style={{ left: `${v.scores[a]}%`, background: color(v, i) }} title={`${v.version}: ${v.scores[a]}`} />
            ))}
          </div>
        </div>
      ))}
      <div className="ribbon-total" title="40 × correctness + 30 × robustness + 15 × efficiency + 15 × quality">
        {latest ? (
          <WhyScore scores={latest.scores} align="right">
            <Develop proven={verified} className="display total-num">
              <CountUp value={latest.total} from={0} />
            </Develop>
          </WhyScore>
        ) : (
          <Develop proven={false} className="display total-num">
            0
          </Develop>
        )}
        <div>
          {gain > 0 ? (
            <div className="gain" style={verified ? { color: "var(--verified)" } : undefined}>
              {verified ? <Glyph name="tick" size={12} /> : null} +<CountUp value={gain} from={0} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
