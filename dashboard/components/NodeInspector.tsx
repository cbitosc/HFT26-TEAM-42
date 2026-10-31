"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { bakedRun } from "@/lib/baked";
import { AXES, formatSeconds } from "@/lib/format";
import { versionEntries, type RunNode, type RunState } from "@/lib/runState";
import { useRuns } from "@/lib/store";
import { findingsOf, useEntry } from "@/lib/useEntry";
import { BarValue } from "./charts";
import { useRippleIn } from "./Ripple";
import { Glyph, HashChip, StatusBadge } from "./ui";

export function NodeInspector({ run, node, onClose }: { run: RunState; node: RunNode; onClose: () => void }) {
  const panel = useRippleIn<HTMLElement>(node.id);
  const close = useRef<HTMLButtonElement>(null);
  const { offChain } = useRuns();
  const sample = offChain(run.id);
  const proof = run.proofs.find((p) => p.to === node.version);
  const regression = run.regressions.find((r) => r.to === node.version);
  const entries = versionEntries(run);
  const record = entries.find((e) => e.to === node.version);
  const diff = run.diffs.find((d) => d.to === node.version);

  // An entry stores the critique that led to it, so a critique is read from the entry that follows.
  const critique = node.role === "critique";
  const load = useEntry((critique ? entries.find((e) => e.from === node.version) : record)?.cid);
  const blob = load.status === "loaded" ? load.entry : undefined;

  const baked = bakedRun(run.id);
  const findings = critique ? baked?.findings[node.version] ?? findingsOf(load) : undefined;
  const models = baked?.models ?? blob?.models;
  const model = critique ? models?.critic : node.role === "generate" || node.role === "revise" ? models?.generator : undefined;
  const settling = node.role === "prove" || node.role === "pin" || node.role === "submit";

  useEffect(() => close.current?.focus(), [node.id]);

  const dismiss = () => {
    const id = node.id;
    onClose();
    document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)?.focus();
  };

  return (
    <aside
      ref={panel}
      className="side frost inspector"
      aria-label={`Details for ${node.label}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
    >
      <section className="side-section">
        <h2 className="label">
          {node.role}
          <button ref={close} type="button" className="side-close" onClick={dismiss} aria-label="Close details">
            <Glyph name="cross" size={13} />
          </button>
        </h2>
        <p className="mb-2 text-base font-medium">{node.label}</p>
        <StatusBadge status={regression ? "regression" : node.status} />
      </section>

      <section className="side-section">
        <dl className="kv">
          {model ? (
            <>
              <dt>model</dt>
              <dd className="mono">{model}</dd>
            </>
          ) : null}
          {node.durationMs ? (
            <>
              <dt>duration</dt>
              <dd className="mono">{formatSeconds(node.durationMs)}</dd>
            </>
          ) : null}
          {node.scores
            ? AXES.map((axis, i) => (
                <div className="contents" key={axis}>
                  <dt>{axis}</dt>
                  <dd>
                    <BarValue value={node.scores?.[i] ?? 0} max={100} />
                  </dd>
                </div>
              ))
            : null}
          {node.total !== undefined ? (
            <>
              <dt>total</dt>
              <dd className="mono">{node.total}</dd>
            </>
          ) : null}
          {node.role === "prove" && proof?.proofHash ? (
            <>
              <dt>proof</dt>
              <dd>
                <HashChip value={proof.proofHash} />
              </dd>
            </>
          ) : null}
          {node.role === "pin" && record?.cid ? (
            <>
              <dt>cid</dt>
              <dd>
                <HashChip value={record.cid} href={record.gatewayUrl} />
              </dd>
            </>
          ) : null}
          {node.role === "submit" && record?.tx ? (
            <>
              <dt>tx</dt>
              <dd>
                <HashChip value={record.tx} href={sample ? undefined : record.etherscanUrl} note={sample ? "sample, no tx" : undefined} />
              </dd>
            </>
          ) : null}
          {settling && blob?.system_prompt_hash ? (
            <>
              <dt>prompt</dt>
              <dd>
                <HashChip value={blob.system_prompt_hash} />
              </dd>
            </>
          ) : null}
          {settling && blob?.score_hash_old ? (
            <>
              <dt>H old</dt>
              <dd>
                <HashChip value={blob.score_hash_old} />
              </dd>
            </>
          ) : null}
          {settling && blob?.score_hash_new ? (
            <>
              <dt>H new</dt>
              <dd>
                <HashChip value={blob.score_hash_new} />
              </dd>
            </>
          ) : null}
        </dl>
        {node.role === "prove" || node.role === "submit" ? (
          <Link href={`/run/${run.id}/proof`} className="side-link">
            Open the proof
          </Link>
        ) : null}
      </section>

      {regression ? (
        <section className="side-section">
          <p className="notice">
            {regression.to} scored lower than {regression.from}, so {regression.from} was kept. Saved as an Avoid entry.
          </p>
          <p className="mt-2 text-sm">{regression.reason}</p>
        </section>
      ) : null}

      {node.role === "revise" && diff ? (
        <section className="side-section">
          <h2 className="label">Changes</h2>
          {diff.changelog.length ? (
            <ul className="side-list">
              {diff.changelog.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <details className="raw">
            <summary>Raw diff</summary>
            <pre>{diff.unifiedDiff}</pre>
          </details>
          <Link href={`/run/${run.id}/diff`} className="side-link">
            Open the diff
          </Link>
        </section>
      ) : null}

      {critique ? (
        <section className="side-section">
          <h2 className="label">Findings</h2>
          {findings?.length ? (
            <ul>
              {findings.map((finding) => (
                <li key={finding.issue} className="border-t border-white/10 py-2">
                  <span className="label">{finding.severity}</span>
                  <p className="m-0 text-[13px] leading-snug">{finding.issue}</p>
                  <p className="notice m-0 mt-1">{finding.suggested_fix}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notice">{load.status === "loading" ? "Reading the entry." : "No data for this node."}</p>
          )}
        </section>
      ) : null}
    </aside>
  );
}
