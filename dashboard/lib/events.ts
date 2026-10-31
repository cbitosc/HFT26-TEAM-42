// The event stream contract, transcribed from docs/02 section 5. That doc wins.
export type Role = "generate" | "critique" | "revise" | "score" | "prove" | "pin" | "submit";
export type NodeStatus = "running" | "done" | "failed";
export type Tier = "candidate" | "validated" | "trusted" | "canonical";
export type Scores = [number, number, number, number];

export interface InheritedEntry {
  entry_id: string;
  cid: string;
  tier: Tier;
  confidence: number;
  summary: string;
  // Not in docs/02, but the agent sends it and it is the only reliable Lessons/Avoid split.
  kind?: "improvement" | "regression";
}

// The agent marks anything it faked in offline mode with `baked: true`.
type Base<T extends string, D> = { ts: number; run_id: string; agent_id: string; type: T; data: D & { baked?: boolean } };

export type RunEvent =
  | Base<"run.started", { task_signature: string; memory_enabled: boolean }>
  | Base<"memory.retrieved", { entries: InheritedEntry[]; token_budget: number }>
  | Base<"node.created", { node_id: string; parent_id: string | null; role: Role; version: string; label: string }>
  | Base<"node.updated", { node_id: string; status: NodeStatus; scores?: Scores; total?: number; duration_ms?: number }>
  | Base<"diff.ready", { from: string; to: string; unified_diff: string; changelog: string[] }>
  | Base<"proof.started", { from: string; to: string }>
  | Base<"proof.done", { from: string; to: string; proof_hash: string | null; proving_ms: number; verified_locally: boolean }>
  | Base<"ipfs.pinned", { entry_id: string; cid: string; gateway_url: string | null }>
  | Base<"chain.tx", { entry_id: string; tx: string | null; status: "pending" | "confirmed" | "reverted"; block?: number; etherscan_url: string | null; reason?: string }>
  | Base<"chain.verified", { entry_id: string; verifier_ok: true; reward_wei: string | number; tier: string | number }>
  | Base<"regression.recorded", { from: string; to: string; reason: string; entry_id: string }>
  | Base<"run.finished", { final_version: string; scores_by_version: Record<string, Scores | number>; total_gain: number }>;
