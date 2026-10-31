"use client";

import Link from "next/link";
import { VERIFIER_ADDRESS, etherscanAddress, etherscanTx } from "@/lib/chain";
import { formatEth, formatSeconds } from "@/lib/format";
import { PROOF_STEPS, versionScores, type Proof, type Regression, type RunState } from "@/lib/runState";
import { useRuns } from "@/lib/store";
import { ScoreClimb, ScoreShift, stagger, type ClimbStep } from "./charts";
import { Develop, Glyph, HashChip, OFFLINE_NOTE, SampleNote, StatusBadge, TierBadge, useSeen, type GlyphName } from "./ui";

const STATIONS: Record<(typeof PROOF_STEPS)[number], { glyph: GlyphName; text: string }> = {
  Proving: { glyph: "hourglass", text: "The maths is worked out" },
  "Proof ready": { glyph: "document", text: "A proof now exists" },
  Pinned: { glyph: "pin", text: "Stored publicly on IPFS" },
  "Tx pending": { glyph: "send", text: "Sent to Sepolia" },
  "Verified on-chain": { glyph: "shield", text: "The contract checks it" },
  "Reward paid": { glyph: "eth", text: "ETH goes to the agent" },
};

// Its own component so the watcher starts when the panel mounts, which on a live run can be after the sheet.
function SheetAxes({ label, from, to }: { label: string; from: readonly number[]; to: readonly number[] }) {
  const { ref, seen } = useSeen<HTMLDivElement>(0.5);
  return (
    <div ref={ref} className="sheet-axes" data-seen={seen}>
      <span className="label">{label}</span>
      <ScoreShift from={from} to={to} />
    </div>
  );
}

function stepState(proof: Proof, index: number, offline: boolean) {
  if (proof.failed && index === 3) return "failed";
  if (index > proof.step) return "todo";
  // Proving and Tx pending are waits: reaching them means they are in progress.
  if (index === proof.step && (index === 0 || index === 3)) return "active";
  return index >= 4 && !offline ? "verified" : "done";
}

function failureText(proof: Proof) {
  if (proof.revertReason) return `The contract rejected this proof: ${proof.revertReason}.`;
  return proof.etherscanUrl
    ? "The transaction reverted. Open it on Etherscan for the reason."
    : "The transaction reverted. No reason was reported.";
}

// What each step left behind, in PROOF_STEPS order.
function stepFacts(proof: Proof, sample: boolean): React.ReactNode[] {
  return [
    proof.provingMs ? <span className="mono">{formatSeconds(proof.provingMs)}</span> : null,
    proof.proofHash ? <HashChip value={proof.proofHash} /> : null,
    proof.cid ? <HashChip value={proof.cid} href={proof.gatewayUrl || undefined} /> : null,
    proof.tx ? (
      <HashChip value={proof.tx} href={sample ? undefined : proof.etherscanUrl || etherscanTx(proof.tx)} note={sample ? "sample, no tx" : undefined} />
    ) : null,
    proof.step >= 3 ? (
      <>
        <HashChip value={VERIFIER_ADDRESS} href={sample ? undefined : etherscanAddress(VERIFIER_ADDRESS)} />
        {proof.block ? <span className="mono">block {proof.block}</span> : null}
      </>
    ) : null,
    proof.rewardWei ? (
      <>
        <span className="mono">{formatEth(proof.rewardWei)}</span>
        {proof.tier ? <TierBadge tier={proof.tier} /> : null}
      </>
    ) : null,
  ];
}

function ProofSheet({ proof, run, sample }: { proof: Proof; run: RunState; sample: boolean }) {
  const scores = new Map(versionScores(run).map((v) => [v.version, v]));
  const before = scores.get(proof.from);
  const after = scores.get(proof.to);
  const verified = proof.step >= 4 && !proof.failed && !run.baked;
  const facts = stepFacts(proof, sample);
  const { ref, seen } = useSeen<HTMLElement>();
  const journey = useSeen<HTMLOListElement>(0.5);

  return (
    <article ref={ref} className="sheet" data-seen={seen} aria-label={`Proof of ${proof.from} to ${proof.to}`}>
      <div className={`sheet-glass ${verified ? "clear" : "frost"}`}>
        <div className="min-w-0">
          <span className="label">
            {proof.from} to {proof.to}
          </span>
          <h2 className="sheet-claim">
            <Develop proven={verified && seen} className="display">
              {before?.total} to {after?.total}
            </Develop>
          </h2>
          <div className="sheet-gain" data-verified={verified}>
            {verified ? <StatusBadge status="verified" /> : null} +{(after?.total ?? 0) - (before?.total ?? 0)} points
          </div>
        </div>
        {before && after ? <SheetAxes label="Where the points came from" from={before.scores} to={after.scores} /> : null}
        <ol ref={journey.ref} className="stepper" data-seen={journey.seen}>
          {PROOF_STEPS.map((step, i) => {
            const state = stepState(proof, i, run.baked);
            return (
              <li key={step} data-state={state} data-link={i < proof.step} aria-current={state === "active" ? "step" : undefined} style={stagger(i)}>
                <span className="stop" aria-hidden="true">
                  <Glyph name={state === "failed" ? "cross" : STATIONS[step].glyph} size={18} />
                </span>
                <div className="stop-text">
                  <b>{step}</b>
                  <span>{STATIONS[step].text}</span>
                  {facts[i] ? <div className="stop-facts">{facts[i]}</div> : null}
                </div>
              </li>
            );
          })}
        </ol>
        {proof.failed ? <p className="notice sheet-failure">{failureText(proof)}</p> : null}
      </div>
    </article>
  );
}

function RegressionSheet({ regression, run }: { regression: Regression; run: RunState }) {
  const scores = new Map(versionScores(run).map((v) => [v.version, v]));
  const before = scores.get(regression.from);
  const after = scores.get(regression.to);
  const { cid, gatewayUrl, tx, etherscanUrl } = run.records[regression.entryId] ?? {};
  const { ref, seen } = useSeen<HTMLElement>();
  return (
    <article ref={ref} className="sheet crack crack-sheet" data-seen={seen} aria-label={`Regression at ${regression.to}`}>
      <div className="min-w-0">
        <span className="label">
          {regression.from} to {regression.to}
        </span>
        <h2 className="sheet-claim display" style={{ color: "var(--regression)" }}>
          {before?.total} to {after?.total}
        </h2>
        <p className="m-0 flex items-center gap-2">
          <Glyph name="crack" />
          {regression.to} scored lower than {regression.from}, so {regression.from} was kept. Saved as an Avoid entry. No reward was requested.
        </p>
        <p className="notice mt-2">{regression.reason}</p>
        <div className="stop-facts mt-2">
          {cid ? <HashChip value={cid} href={gatewayUrl} /> : null}
          {tx ? <HashChip value={tx} href={etherscanUrl || etherscanTx(tx)} /> : null}
        </div>
      </div>
      {before && after ? <SheetAxes label="Where the points went" from={before.scores} to={after.scores} /> : null}
    </article>
  );
}

function climbSteps(run: RunState): ClimbStep[] {
  const versions = versionScores(run);
  const totals = new Map(versions.map((v) => [v.version, v.total]));
  return versions.map(({ version, total }) => {
    const proof = run.proofs.find((p) => p.to === version);
    if (proof) return { version, total, from: totals.get(proof.from), tone: proof.step >= 4 && !proof.failed && !run.baked ? "verified" : "pending" };
    const regression = run.regressions.find((r) => r.to === version);
    if (regression) return { version, total, from: totals.get(regression.from), tone: "regression" };
    return { version, total };
  });
}

const PROVEN = [
  "The committed score went up under committed weights",
  "The CID is bound to this entry on-chain",
  "The reward was paid after verification",
];

const NOT_PROVEN = [
  "That the harness ran honestly. The harness digest is published so anyone can re-run it",
  "That the proof is bound to the CID or the author",
  "That memory caused the gain",
];

export function ProofPanel({ run }: { run: RunState }) {
  const { sourceOf, offChain } = useRuns();
  const sample = offChain(run.id);
  const steps = climbSteps(run);
  const limits = useSeen<HTMLDivElement>();
  return (
    <div className="proof-page">
      <header className="page-head">
        <div>
          <h1>Proof</h1>
          <p>Each improvement gets a cryptographic proof that its score really went up, recorded on Sepolia.</p>
        </div>
      </header>
      {sourceOf(run.id) === "baked" ? <SampleNote /> : run.baked ? <p className="sample-note">{OFFLINE_NOTE}</p> : null}
      {steps.length > 1 ? <ScoreClimb steps={steps} /> : null}
      <div className="proofs">
        {!run.proofs.length && !run.regressions.length ? (
          <div className="grid justify-items-start gap-2">
            <p className="notice">No proofs yet. They start when a version beats the last one.</p>
            <Link href={`/run/${run.id}`} className="btn">
              Back to the run
            </Link>
          </div>
        ) : null}
        {run.proofs.map((proof) => (
          <ProofSheet key={`${proof.from}-${proof.to}`} proof={proof} run={run} sample={sample} />
        ))}
        {run.regressions.map((regression) => (
          <RegressionSheet key={regression.entryId} regression={regression} run={run} />
        ))}
      </div>
      <div ref={limits.ref} className="limits-panel" data-seen={limits.seen}>
        <section>
          <h2 className="label">Proven</h2>
          <ul className="limits">
            {PROVEN.map((claim, i) => (
              <li key={claim} style={stagger(i)}>
                <Glyph name="tick" />
                {claim}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="label">Not proven</h2>
          <ul className="limits">
            {NOT_PROVEN.map((claim, i) => (
              <li key={claim} style={stagger(i)}>
                <Glyph name="cross" />
                {claim}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
