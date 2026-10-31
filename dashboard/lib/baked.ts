import data from "@/mock/baked.json";
import type { RunEvent, Tier } from "./events";
import { formatDay } from "./format";

export interface Finding {
  severity: string;
  issue: string;
  suggested_fix: string;
}

export interface BakedRun {
  id: string;
  title: string;
  task: string;
  agent: string;
  provenance: string;
  findings: Record<string, Finding[]>;
  models: { generator: string; critic: string };
  events: RunEvent[];
}

export interface Evidence {
  ts: number;
  reporter: string;
  supported: boolean;
  tx: string;
  note: string;
}

export type EntryOrigin = "run" | "rehearsal" | "attestation" | "planted";

export interface MemoryEntry {
  entry_id: string;
  cid: string;
  tx: string;
  // A recorded run, an earlier rehearsal, an A/B attestation, or a wrong lesson published as a test.
  origin: EntryOrigin;
  author: string;
  agent_id: string;
  task_signature: string;
  kind: string;
  verified: boolean;
  hypothesis: string;
  failure_pattern: string;
  fix_summary: string;
  scores: { old: number[]; new: number[] };
  tier: Tier;
  confidence: number;
  supported: number;
  contradicted: number;
  supersedes: string | null;
  created_at: number;
  evidence: Evidence[];
  promotions: { ts: number; tier: Tier }[];
}

export interface ChainRow {
  event: "ImprovementRecorded" | "EvidencePosted" | "RewardPaid";
  ts: number;
  entry_id: string;
  actor: string;
  tx: string;
  cid?: string;
  verified?: boolean;
  supported?: boolean;
  amount_wei?: string;
}

export const bakedRuns = data.runs as unknown as BakedRun[];
export const bakedMemory = data.memory as unknown as MemoryEntry[];
export const bakedChain = data.chain as unknown as {
  exported_at: number;
  block: number;
  log: ChainRow[];
  balances: {
    agents: { label: string; address: string; wei: string }[];
    escrow: { address: string; wei: string };
    total_paid_wei: string;
  };
};

// Agent A's recorded run on Sepolia. Replayed, and clearly labelled, with no bridge needed.
export const REAL_RUN_ID = "real-a";

export const SNAPSHOT_NOTE = `Snapshot of the Sepolia registry, ${formatDay(bakedChain.exported_at)}, block ${bakedChain.block}.`;

export const bakedRun = (id: string) => bakedRuns.find((run) => run.id === id);
export const entryById = (id: string) => bakedMemory.find((entry) => entry.entry_id === id);
