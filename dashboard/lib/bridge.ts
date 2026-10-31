import type { Finding } from "./baked";
import type { Tier } from "./events";
import { normaliseTier } from "./format";

export const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL ?? "";

export interface Health {
  ok: boolean;
  chainId: number;
  registry: string;
  pinata: boolean;
}

export interface RankedEntry {
  entry_id: string;
  cid: string;
  tier: Tier;
  confidence: number;
  entry: Record<string, unknown>;
}

// The fields of the memory entry blob (docs/02 section 2) that the UI reads.
export interface EntryBlob {
  critique?: { model?: string; findings?: Finding[] };
  models?: { generator?: string; critic?: string };
  system_prompt_hash?: string;
  score_hash_old?: string;
  score_hash_new?: string;
}

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`${BRIDGE_URL}${path}`);
  if (!response.ok) throw new Error(`Bridge returned ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

export const fetchHealth = () => read<Health>("/health");

export const fetchEntry = (cid: string) => read<EntryBlob>(`/entry/${encodeURIComponent(cid)}`);

export const fetchMemory = async (task: string, k = 5): Promise<RankedEntry[]> => {
  const entries = await read<(Omit<RankedEntry, "tier"> & { tier: Tier | number })[]>(
    `/memory?task=${encodeURIComponent(task)}&k=${k}`,
  );
  return entries.map((entry) => ({ ...entry, tier: normaliseTier(entry.tier) }));
};
