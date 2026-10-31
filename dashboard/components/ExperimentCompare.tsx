"use client";

import { etherscanTx } from "@/lib/chain";
import { experiment, failureRows, isProven, lessons, median, testName } from "@/lib/experiment";
import { AXES, promptBlock } from "@/lib/format";
import { BarValue, MirrorChart, WhyScore, stagger } from "./charts";
import { CountUp, Develop, Glyph, HashChip, StatusBadge, TierBadge, useEntrance } from "./ui";

const { proven, off, on, trials, task_signature } = experiment;
const MAX_TOTAL = 10000;
// The score without memory lands first, then the gain climbs from it.
const COUNT_GAIN_AT = 0.4;

function TrialChart() {
  const gain = on.mean_total - off.mean_total;
  return (
    <section className="ab-section">
      <h2 className="label mb-1">
        All {trials} trials, total score out of {MAX_TOTAL}
      </h2>
      <MirrorChart
        heads
        max={MAX_TOTAL}
        reach={72}
        seam={176}
        label={`Total score by trial, without memory against with memory: ${off.totals.map((total, i) => `trial ${i + 1}, ${total} to ${on.totals[i]}`).join("; ")}.`}
        rows={off.totals.map((total, i) => ({
          name: i + 1 === proven.trial ? `Trial ${i + 1}, headline` : `Trial ${i + 1}`,
          off: total,
          on: on.totals[i],
          gain: `+${on.totals[i] - total}`,
          strong: i + 1 === proven.trial,
        }))}
      />
      <p className="notice mt-2">
        Each row is one attempt at the same task. Trial {proven.trial} is the headline because its gain is the middle of the {trials}, so the one very low score of{" "}
        {Math.min(...off.totals)} can&apos;t inflate it. Averages would show +{gain}.
      </p>
    </section>
  );
}

function FailureChart() {
  const all = failureRows(experiment);
  const rare = all.filter((row) => row.off <= 1 && row.on === 0);
  const rows = all.filter((row) => !rare.includes(row));

  return (
    <section>
      <h2 className="label mb-1">Tests that failed, out of {trials} trials</h2>
      <MirrorChart
        heads
        lowerIsBetter
        max={trials}
        reach={72}
        seam={148}
        label={`Failures by test: ${rows.map((row) => `${testName(row.test)}, ${row.off} without memory, ${row.on} with memory`).join("; ")}.`}
        rows={rows.map((row) => ({
          name: testName(row.test),
          off: row.off,
          on: row.on,
          gain: row.on === row.off ? undefined : `${Math.abs(row.on - row.off)} ${row.on < row.off ? "fewer" : "more"}`,
        }))}
      />
      <p className="notice mt-2">
        {rare.length} other tests failed once without memory and never with it. Memory fixed the failures its lesson covered, left the TTL check failing and added
        a boundary mistake. Five trials on one task is a small sample, and part of the gain comes from efficiency and quality, which the lesson does not address.
      </p>
      {proven.tx ? (
        <p className="notice mt-2">
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={etherscanTx(proven.tx)} target="_blank" rel="noreferrer">
            Median pair proven on-chain: {proven.off_total} to {proven.on_total}
            <Glyph name="external" size={12} />
          </a>{" "}
          {proven.on_total} is that one pair&apos;s score. Across all {trials} trials the median totals are {median(off.totals)} without memory and {median(on.totals)} with it.
        </p>
      ) : null}
      <p className="notice mt-2">Measured over {trials} trials. The proof shows the score increased, and the trials are the evidence that memory helped.</p>
    </section>
  );
}

function Lessons() {
  const inherited = lessons(experiment);
  const { ref, entrance } = useEntrance<HTMLElement>();
  return (
    <section ref={ref} data-entrance={entrance}>
      <h2 className="label mb-1">Inherited {inherited.length === 1 ? "lesson" : "lessons"}</h2>
      {inherited.map((lesson) => (
        <article key={lesson.entry_id}>
          <div className="flex items-center justify-between gap-3 py-1">
            <TierBadge tier={lesson.tier} />
            <span className="notice">from {lesson.task}</span>
          </div>
          <ul className="lesson-fixes">
            {lesson.fixes.map((fix, i) => (
              <li key={fix} style={stagger(i)}>
                {fix}
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-1">
            <span className="notice">Confidence</span>
            <BarValue value={lesson.confidence} max={1} text={lesson.confidence.toFixed(2)} />
          </div>
          <p className="notice mt-2">No reuse is recorded yet, so confidence has no history to chart.</p>
          <details className="raw mt-2">
            <summary>What Agent B received</summary>
            <pre>{promptBlock(lesson.kind, lesson.tier, lesson.summary)}</pre>
          </details>
        </article>
      ))}
    </section>
  );
}

export function ExperimentCompare() {
  const proofed = isProven(experiment);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Does memory help?</h1>
          <p>
            Agent B&apos;s first attempt at {task_signature}, {trials} trials each way, starting from nothing or with memory from Agent A.
          </p>
        </div>
      </header>
      <section className="ab-head" data-proven={proofed}>
        <div className="ab-arm">
          <span className="label">Agent B, trial {proven.trial}</span>
          <h2>Without memory</h2>
          <div className="mt-1">
            <WhyScore scores={proven.off}>
              <span className="axis-value" data-tone="worse">
                <CountUp value={proven.off_total} from={0} />
              </span>
            </WhyScore>
          </div>
        </div>
        <div className="ab-verdict grid justify-items-center">
          <Develop proven={proofed} className="display ab-delta">
            +<CountUp value={proven.delta} from={0} delay={COUNT_GAIN_AT} />
          </Develop>
          <span className="flex items-center gap-2">
            <StatusBadge status={proofed ? "verified" : "measured"} />
            <span className="notice">
              Median gain, trial {proven.trial} of {trials}
            </span>
          </span>
          {proven.tx ? <HashChip value={proven.tx} href={etherscanTx(proven.tx)} /> : null}
        </div>
        <div className="ab-arm" data-side="right">
          <span className="label">Agent B, trial {proven.trial}</span>
          <h2>With inherited memory</h2>
          <div className="mt-1">
            <WhyScore scores={proven.on} align="right">
              <span className="axis-value" data-tone="better">
                <CountUp value={proven.on_total} from={proven.off_total} delay={COUNT_GAIN_AT} />
              </span>
            </WhyScore>
          </div>
        </div>
      </section>
      <MirrorChart
        max={100}
        label={`V1 score per axis in trial ${proven.trial}, without memory against with memory: ${AXES.map((axis, i) => `${axis} ${proven.off[i]} to ${proven.on[i]}`).join(", ")}.`}
        rows={AXES.map((axis, i) => ({
          name: axis,
          off: proven.off[i],
          on: proven.on[i],
          gain: proven.on[i] === proven.off[i] ? undefined : `+${proven.on[i] - proven.off[i]}`,
        }))}
      />
      <TrialChart />
      <div className="ab-lower">
        <Lessons />
        <FailureChart />
      </div>
    </>
  );
}
