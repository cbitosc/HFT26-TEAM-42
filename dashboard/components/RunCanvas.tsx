"use client";

import type { CSSProperties, ReactNode } from "react";
import { columnsFor, MAX_TOTAL, type NodeState, type VersionColumn } from "@/lib/runLayout";
import type { RunNode, RunState } from "@/lib/runState";
import { Develop, Glyph } from "./ui";

const SHORT_LABEL: Record<string, string> = { pin: "IPFS", submit: "Sepolia" };

interface StepProps {
  node: RunNode;
  state: NodeState;
  kept?: string;
  className?: string;
  selected: string | null;
  onSelect: (id: string) => void;
  children: ReactNode;
}

function Step({ node, state, kept, className = "", selected, onSelect, children }: StepProps) {
  return (
    <button
      type="button"
      className={`rn ${className}`}
      data-node-id={node.id}
      data-role={node.role}
      data-status={node.status}
      data-state={state}
      aria-pressed={selected === node.id}
      aria-label={`${node.label}, ${node.status}${node.total !== undefined ? `, score ${node.total}` : ""}${kept ? `, regression, ${kept} was kept` : ""}`}
      onClick={() => onSelect(node.id)}
    >
      {children}
    </button>
  );
}

function Mark({ node, state }: { node: RunNode; state: NodeState }) {
  if (node.status === "done") return <Glyph name={state === "crack" ? "crack" : "tick"} size={11} />;
  return node.status === "failed" ? <Glyph name="cross" size={11} /> : null;
}

function Pillar({ column, selected, onSelect }: { column: VersionColumn; selected: string | null; onSelect: (id: string) => void }) {
  const { version, state, code, score, gain, kept, final } = column;
  const shared = { state, selected, onSelect };
  // Only a score awaiting its proof stays sealed: the baseline has nothing to prove, and a regression never gets one.
  const settled = state !== "plain" || code?.role === "generate";
  return (
    <div
      className="pillar"
      data-state={state}
      style={score?.total !== undefined && state !== "crack" ? { height: `${(score.total / MAX_TOTAL) * 100}%` } : undefined}
    >
      <div className="pillar-head">
        <span>{version}</span>
        {final ? (
          <span className="pillar-kept">
            <Glyph name="tick" size={11} /> Kept
          </span>
        ) : null}
        {kept ? <span className="rn-kept">kept {kept}</span> : null}
      </div>
      {score ? (
        <Step {...shared} node={score} kept={kept} className="pillar-score">
          {score.total !== undefined ? (
            <>
              <Develop proven={settled} className="display">
                {score.total}
              </Develop>
              {gain ? <span className="gain">{gain > 0 ? `+${gain}` : gain}</span> : null}
            </>
          ) : (
            <span className="rn-role">Scoring</span>
          )}
        </Step>
      ) : null}
      {code ? (
        <Step {...shared} node={code} className="pillar-code">
          <span className="rn-role">
            {code.role}
            <Mark node={code} state={state} />
          </span>
        </Step>
      ) : null}
    </div>
  );
}

function Column({ column, nextState, nextRunning, position, selected, onSelect }: {
  column: VersionColumn;
  nextState?: NodeState;
  nextRunning: boolean;
  position: number;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { state, critique, settlement, code, score, feedsNext } = column;
  const sunk = state === "crack";
  const baseline = code?.role === "generate" && score?.total !== undefined;
  const shared = { selected, onSelect };

  return (
    <div className="version" style={{ "--col": position } as CSSProperties} data-sunk={sunk}>
      {critique || settlement.length ? <i className="spine" data-state={state} data-settled={settlement.length > 0} /> : null}
      {feedsNext && !sunk ? (
        <i className="feed" data-sunk={nextState === "crack"} data-active={nextRunning}>
          <b className="feed-pulse" data-tone={nextState} />
        </i>
      ) : null}
      <Pillar column={column} {...shared} />
      {critique ? (
        <Step {...shared} node={critique} state="plain" className="version-critique">
          <span className="rn-role">
            {critique.role}
            <Mark node={critique} state="plain" />
          </span>
          <span className="rn-main">{critique.label}</span>
        </Step>
      ) : null}
      {settlement.length ? (
        <div className="version-settle">
          {settlement.map((node) => (
            <Step key={node.id} {...shared} node={node} state={state}>
              <span className="rn-role">
                {node.role}
                <Mark node={node} state={state} />
              </span>
              <span className="rn-main">{SHORT_LABEL[node.role] ?? node.version}</span>
            </Step>
          ))}
        </div>
      ) : baseline ? (
        <p className="notice version-settle">Baseline, nothing to prove.</p>
      ) : null}
    </div>
  );
}

export function RunCanvas({ run, selected, onSelect }: { run: RunState; selected: string | null; onSelect: (id: string) => void }) {
  const columns = columnsFor(run);
  // Fixed framing: the stage must not jump as versions arrive during a run.
  const slots = run.phase === "finished" ? Math.max(columns.length, 1) : Math.max(columns.length, 3);
  const retrieve = run.nodes.retrieve;

  return (
    <div className="versions" style={{ "--slots": slots } as CSSProperties}>
      <div className="versions-lane" data-lane="writes">
        {retrieve ? (
          <Step node={retrieve} state="plain" selected={selected} onSelect={onSelect} className="version-retrieve">
            <span className="rn-role">
              {retrieve.role}
              <Mark node={retrieve} state="plain" />
            </span>
          </Step>
        ) : null}
        <span className="label">Writes the code</span>
      </div>
      <div className="versions-line" />
      <span className="label versions-lane" data-lane="reviews">
        Reviews the code
      </span>
      <span className="label versions-lane" data-lane="proves">
        Proves the gain
      </span>
      {columns.map((column, i) => {
        const next = columns[i + 1];
        return (
          <Column
            key={column.version}
            column={column}
            nextState={next?.state}
            nextRunning={next?.code?.status === "running"}
            position={i + 2}
            selected={selected}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
