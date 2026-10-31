import { isRegressed, isVerified, type RunNode, type RunState } from "./runState";

// 100 on all four axes, weighted 40/30/15/15.
export const MAX_TOTAL = 10000;

export type NodeState = "plain" | "clear" | "crack";

export interface VersionColumn {
  version: string;
  state: NodeState;
  code?: RunNode;
  score?: RunNode;
  critique?: RunNode;
  settlement: RunNode[];
  // Over the last version that held. A failed version has no gain.
  gain?: number;
  // Set on a failed version: the version that was kept instead.
  kept?: string;
  final: boolean;
  // The next column was revised from this column's critique.
  feedsNext: boolean;
}

const stateOf = (run: RunState, version: string): NodeState => {
  if (isRegressed(run, version)) return "crack";
  return isVerified(run, version) ? "clear" : "plain";
};

// One column per version, in the order the run reached them. A run has a single row of attempts,
// so a version's steps are read top to bottom and the versions left to right.
export function columnsFor(run: RunState): VersionColumn[] {
  const present = run.order.map((id) => run.nodes[id]).filter((node) => node.role !== "retrieve");
  const versions = Array.from(new Set(present.map((node) => node.version)));

  let held: number | undefined;
  const columns = versions.map((version): VersionColumn => {
    const steps = present.filter((node) => node.version === version);
    const score = steps.find((node) => node.role === "score");
    const state = stateOf(run, version);
    const gain = held !== undefined && state !== "crack" && score?.total !== undefined ? score.total - held : undefined;
    if (state !== "crack" && score?.total !== undefined) held = score.total;
    return {
      version,
      state,
      code: steps.find((node) => node.role === "generate" || node.role === "revise"),
      score,
      critique: steps.find((node) => node.role === "critique"),
      settlement: steps.filter((node) => node.role === "prove" || node.role === "pin" || node.role === "submit"),
      gain,
      kept: run.regressions.find((r) => r.to === version)?.from,
      final: run.finalVersion === version,
      feedsNext: false,
    };
  });

  return columns.map((column, i) => ({
    ...column,
    feedsNext: Boolean(column.critique) && columns[i + 1]?.code?.parentId === column.critique?.id,
  }));
}
