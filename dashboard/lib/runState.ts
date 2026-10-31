import type { InheritedEntry, NodeStatus, Role, RunEvent, Scores, Tier } from "./events";
import { ipfsUrl, normaliseTier } from "./format";

export interface RunNode {
  id: string;
  parentId: string | null;
  role: Role | "retrieve";
  version: string;
  label: string;
  status: NodeStatus;
  scores?: Scores;
  total?: number;
  durationMs?: number;
}

export interface Diff {
  from: string;
  to: string;
  unifiedDiff: string;
  changelog: string[];
}

export const PROOF_STEPS = ["Proving", "Proof ready", "Pinned", "Tx pending", "Verified on-chain", "Reward paid"] as const;

export interface Proof {
  from: string;
  to: string;
  // Index into PROOF_STEPS of the last step reached.
  step: number;
  failed: boolean;
  proofHash?: string;
  provingMs?: number;
  verifiedLocally?: boolean;
  entryId?: string;
  cid?: string;
  gatewayUrl?: string;
  tx?: string;
  block?: number;
  etherscanUrl?: string;
  rewardWei?: string;
  tier?: Tier;
  revertReason?: string;
}

// What the stream says about one entry. A regression has no proof, so this is the only place its CID and tx live.
export interface EntryRecord {
  cid?: string;
  gatewayUrl?: string;
  tx?: string;
  etherscanUrl?: string;
}

export interface Regression {
  from: string;
  to: string;
  reason: string;
  entryId: string;
}

export interface RunState {
  id: string;
  agentId: string;
  task: string;
  memoryEnabled: boolean;
  phase: "idle" | "running" | "finished";
  memory: InheritedEntry[];
  tokenBudget: number;
  nodes: Record<string, RunNode>;
  order: string[];
  diffs: Diff[];
  proofs: Proof[];
  regressions: Regression[];
  records: Record<string, EntryRecord>;
  // True once any event says it was faked offline, however it reached us.
  baked: boolean;
  finalVersion?: string;
  totalGain?: number;
}

export const emptyRun = (id: string): RunState => ({
  id,
  agentId: "",
  task: "",
  memoryEnabled: false,
  phase: "idle",
  memory: [],
  tokenBudget: 0,
  nodes: {},
  order: [],
  diffs: [],
  proofs: [],
  regressions: [],
  records: {},
  baked: false,
});

const updateProof = (state: RunState, match: (proof: Proof) => boolean, change: (proof: Proof) => Proof): RunState => {
  let index = -1;
  state.proofs.forEach((proof, i) => {
    if (match(proof)) index = i;
  });
  if (index < 0) return state;
  const proofs = state.proofs.slice();
  proofs[index] = change(proofs[index]);
  return { ...state, proofs };
};

const record = (state: RunState, entryId: string, change: EntryRecord): RunState => ({
  ...state,
  records: { ...state.records, [entryId]: { ...state.records[entryId], ...change } },
});

// Pure and tolerant. Events can be missing, and the bridge resends its history on every reconnect,
// so each case must also be safe to apply twice.
export function applyEvent(state: RunState, event: RunEvent): RunState {
  const next = reduce(state, event);
  return event.data.baked && !next.baked ? { ...next, baked: true } : next;
}

function reduce(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "run.started":
      return {
        ...state,
        agentId: event.agent_id,
        task: event.data.task_signature,
        memoryEnabled: event.data.memory_enabled,
        phase: "running",
      };
    case "memory.retrieved": {
      // `retrieve` is not a node.created role in the contract, so the tree synthesises it here.
      const retrieve: RunNode = {
        id: "retrieve",
        parentId: null,
        role: "retrieve",
        version: "",
        label: "Retrieve memory",
        status: "done",
      };
      return {
        ...state,
        memory: event.data.entries.map((entry) => ({ ...entry, tier: normaliseTier(entry.tier) })),
        tokenBudget: event.data.token_budget,
        nodes: { ...state.nodes, retrieve },
        order: state.order.includes("retrieve") ? state.order : ["retrieve", ...state.order],
      };
    }
    case "node.created": {
      const { node_id, parent_id, role, version, label } = event.data;
      if (state.nodes[node_id]) return state;
      const parentId = parent_id ?? (state.nodes.retrieve ? "retrieve" : null);
      return {
        ...state,
        nodes: { ...state.nodes, [node_id]: { id: node_id, parentId, role, version, label, status: "running" } },
        order: state.order.includes(node_id) ? state.order : [...state.order, node_id],
      };
    }
    case "node.updated": {
      const node = state.nodes[event.data.node_id];
      if (!node) return state;
      const { status, scores, total, duration_ms } = event.data;
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [node.id]: {
            ...node,
            status,
            scores: scores ?? node.scores,
            total: total ?? node.total,
            durationMs: duration_ms ?? node.durationMs,
          },
        },
      };
    }
    case "diff.ready": {
      const { from, to, unified_diff, changelog } = event.data;
      const diff = { from, to, unifiedDiff: unified_diff, changelog };
      return { ...state, diffs: [...state.diffs.filter((d) => !(d.from === from && d.to === to)), diff] };
    }
    case "proof.started":
      if (state.proofs.some((p) => p.from === event.data.from && p.to === event.data.to)) return state;
      return { ...state, proofs: [...state.proofs, { from: event.data.from, to: event.data.to, step: 0, failed: false }] };
    case "proof.done": {
      const { from, to, proof_hash, proving_ms, verified_locally } = event.data;
      return updateProof(
        state,
        (p) => p.from === from && p.to === to,
        (p) => ({ ...p, step: Math.max(p.step, 1), proofHash: proof_hash ?? undefined, provingMs: proving_ms, verifiedLocally: verified_locally }),
      );
    }
    case "ipfs.pinned": {
      const { entry_id, cid, gateway_url } = event.data;
      const gatewayUrl = gateway_url || ipfsUrl(cid);
      const pinned = record(state, entry_id, { cid, gatewayUrl });
      if (state.proofs.some((p) => p.entryId === entry_id)) return pinned;
      // The contract has no from/to here, so the entry belongs to the newest unpinned proof.
      // Regressions are pinned too, but they have no proof and nothing matches.
      return updateProof(
        pinned,
        (p) => !p.entryId,
        (p) => ({ ...p, step: 2, entryId: entry_id, cid, gatewayUrl }),
      );
    }
    case "chain.tx": {
      const { entry_id, tx, status, block, etherscan_url, reason } = event.data;
      const sent = record(state, entry_id, { tx: tx ?? undefined, etherscanUrl: etherscan_url ?? undefined });
      return updateProof(
        sent,
        (p) => p.entryId === entry_id,
        (p) => ({
          ...p,
          step: Math.max(p.step, 3),
          failed: status === "reverted",
          tx: tx ?? p.tx,
          block: block ?? p.block,
          etherscanUrl: etherscan_url ?? p.etherscanUrl,
          revertReason: reason ?? p.revertReason,
        }),
      );
    }
    case "chain.verified": {
      const { entry_id, reward_wei, tier } = event.data;
      return updateProof(
        state,
        (p) => p.entryId === entry_id,
        (p) => ({
          ...p,
          step: Math.max(p.step, BigInt(reward_wei) > 0n ? 5 : 4),
          failed: false,
          rewardWei: String(reward_wei),
          tier: normaliseTier(tier),
        }),
      );
    }
    case "regression.recorded": {
      const { from, to, reason, entry_id } = event.data;
      if (state.regressions.some((r) => r.entryId === entry_id)) return state;
      return { ...state, regressions: [...state.regressions, { from, to, reason, entryId: entry_id }] };
    }
    case "run.finished":
      return { ...state, phase: "finished", finalVersion: event.data.final_version, totalGain: event.data.total_gain };
  }
}

export interface VersionScore {
  version: string;
  scores: Scores;
  total: number;
}

export const versionScores = (run: RunState): VersionScore[] =>
  run.order
    .map((id) => run.nodes[id])
    .filter((node) => node.role === "score" && node.scores && node.total !== undefined)
    .map((node) => ({ version: node.version, scores: node.scores as Scores, total: node.total as number }));

export const isVerified = (run: RunState, version: string) =>
  !run.baked && run.proofs.some((proof) => proof.to === version && proof.step >= 4 && !proof.failed);

export const isRegressed = (run: RunState, version: string) => run.regressions.some((r) => r.to === version);

export interface VersionEntry extends EntryRecord {
  from: string;
  to: string;
}

// Every memory entry the run produced, whether it improved on the last version or not.
export const versionEntries = (run: RunState): VersionEntry[] => [
  ...run.proofs.map(({ from, to, cid, gatewayUrl, tx, etherscanUrl }) => ({ from, to, cid, gatewayUrl, tx, etherscanUrl })),
  ...run.regressions.map(({ from, to, entryId }) => ({ from, to, ...run.records[entryId] })),
];

// One sentence for what the run is doing now, in the words of docs/08 section 7.
export function runStatus(run: RunState): string {
  const failed = run.proofs.find((proof) => proof.failed);
  if (failed) {
    return failed.revertReason
      ? `The contract rejected this proof: ${failed.revertReason}.`
      : "The transaction reverted. Open it on Etherscan for the reason.";
  }
  if (run.phase === "idle") return "Waiting for the first event.";
  if (run.phase === "finished") {
    const gain = run.totalGain ? `, +${run.totalGain} over V1` : "";
    return `Kept ${run.finalVersion}${gain}.`;
  }
  const proof = run.proofs[run.proofs.length - 1];
  if (proof && proof.step < 2) return `Proving ${proof.to} beat ${proof.from}`;
  const current = run.order.map((id) => run.nodes[id]).filter((node) => node.status === "running").pop();
  return current?.label ?? "Running";
}
