import data from "../../shared/baked/experiment.json";
import seed from "../../shared/baked/memory_seed.json";
import type { Tier } from "./events";
import { normaliseTier } from "./format";

export interface Arm {
  vectors: number[][];
  totals: number[];
  mean_vector: number[];
  mean_total: number;
  test_failures: Record<string, number>;
}

export interface Experiment {
  task_signature: string;
  trials: number;
  off: Arm;
  on: Arm;
  proven: {
    trial: number;
    off: number[];
    on: number[];
    off_total: number;
    on_total: number;
    delta: number;
    tx: string | null;
    block: number | null;
  };
  inherited: string[];
}

export interface Lesson {
  entry_id: string;
  task: string;
  kind: string;
  summary: string;
  tier: Tier;
  confidence: number;
  fixes: string[];
}

export interface FailureRow {
  test: string;
  off: number;
  on: number;
}

// The real A/B result from agent/experiment.py. Not sample data, so it never renders as `baked`.
export const experiment = data as Experiment;

export const isProven = ({ proven }: Experiment) => Boolean(proven.tx);

export const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

// Biggest fix first, and anything memory made worse last.
export function failureRows({ off, on }: Experiment): FailureRow[] {
  const tests = new Set([...Object.keys(off.test_failures), ...Object.keys(on.test_failures)]);
  return [...tests]
    .map((test) => ({ test, off: off.test_failures[test] ?? 0, on: on.test_failures[test] ?? 0 }))
    .sort((a, b) => a.on - a.off - (b.on - b.off) || a.test.localeCompare(b.test));
}

const TEST_NAMES: Record<string, string> = {
  test_capacity_zero_put_is_a_noop: "Capacity 0",
  test_negative_capacity_rejected: "Negative capacity",
  test_non_positive_ttl_rejected: "Zero TTL",
  test_expiry_boundary_is_expired: "Expiry boundary",
};

export const testName = (test: string) => TEST_NAMES[test] ?? test.replace(/^test_/, "").replaceAll("_", " ");

// The seed summary reads "task: first fix; second fix".
export function lessons({ inherited }: Experiment): Lesson[] {
  return seed
    .filter((entry) => inherited.includes(entry.entry_id))
    .map((entry) => ({
      entry_id: entry.entry_id,
      task: entry.task_signature,
      kind: entry.kind,
      summary: entry.summary,
      tier: normaliseTier(entry.tier),
      confidence: entry.confidence,
      fixes: entry.summary
        .replace(`${entry.task_signature}: `, "")
        .replaceAll("`", "")
        .split(/;\s+/),
    }));
}
