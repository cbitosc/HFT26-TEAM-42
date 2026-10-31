// Generates mock/baked.json from recorded data only: the real agent runs in shared/baked and the
// registry snapshot written by scripts/export-registry.mjs. Nothing here is synthetic.
//
//   node scripts/export-registry.mjs
//   node mock/generate.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const baked = join(here, "..", "..", "shared", "baked");

const TIERS = ["candidate", "validated", "trusted", "canonical"];
const ZERO_ENTRY = `0x${"0".repeat(64)}`;

const registry = JSON.parse(readFileSync(join(baked, "registry.json"), "utf8"));
const blobOf = new Map(registry.entries.map((entry) => [entry.entry_id, entry.blob]));

const readEvents = (name) =>
  readFileSync(join(baked, `${name}.events.jsonl`), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

// An entry stores the critique that led to it, and a revise node hangs off that critique.
function findingsFor(events) {
  const nodes = new Map(events.filter((event) => event.type === "node.created").map((event) => [event.data.node_id, event.data]));
  const blobs = events.filter((event) => event.type === "ipfs.pinned").map((event) => blobOf.get(event.data.entry_id));
  const findings = {};
  for (const node of nodes.values()) {
    const critique = nodes.get(node.parent_id);
    const blob = blobs.find((item) => item?.to_version === node.version);
    if (node.role === "revise" && critique?.role === "critique" && blob) findings[critique.version] ??= blob.critique.findings;
  }
  return findings;
}

function buildRun({ id, title, agent }) {
  const events = readEvents(id);
  const pinned = events.find((event) => event.type === "ipfs.pinned");
  return {
    id,
    title,
    task: events[0].data.task_signature,
    agent,
    provenance: "replay",
    findings: findingsFor(events),
    models: blobOf.get(pinned.data.entry_id).models,
    events,
  };
}

const runs = [
  buildRun({ id: "real-a", title: "Agent A, lru-cache", agent: "agentA" }),
  buildRun({ id: "real-b", title: "Agent B, ttl-cache", agent: "agentB" }),
];

// ---------------------------------------------------------------- Memory registry

const runEntries = new Set(runs.flatMap((run) => run.events.filter((event) => event.type === "ipfs.pinned").map((event) => event.data.entry_id)));

// A/B attestations record a result, and their versions are not V-numbers. See is_lesson in agent/memory.py.
const originOf = (entry) => {
  if (entry.blob.planted) return "planted";
  if (!/^V\d+$/.test(entry.blob.to_version)) return "attestation";
  return runEntries.has(entry.entry_id) ? "run" : "rehearsal";
};

const labelOf = (agentId) => `Agent ${agentId.slice(-1).toUpperCase()}`;
const agentOf = new Map(registry.entries.map((entry) => [entry.author.toLowerCase(), entry.blob.agent_id]));

const evidenceRows = (entryId) => registry.log.filter((row) => row.event === "EvidencePosted" && row.entry_id === entryId).reverse();

function promotionsOf(entry) {
  const promotions = [{ ts: entry.created_at, tier: TIERS[0] }];
  for (const row of evidenceRows(entry.entry_id)) {
    if (TIERS[row.tier] !== promotions[promotions.length - 1].tier) promotions.push({ ts: row.ts, tier: TIERS[row.tier] });
  }
  return promotions;
}

const memory = registry.entries.map((entry) => {
  const { blob, entry_id, supported, contradicted } = entry;
  const reports = supported + contradicted;
  return {
    entry_id,
    cid: entry.cid,
    tx: entry.tx,
    origin: originOf(entry),
    author: entry.author,
    agent_id: blob.agent_id,
    task_signature: blob.task_signature,
    kind: blob.kind,
    verified: entry.verified,
    hypothesis: blob.hypothesis,
    failure_pattern: blob.failure_pattern,
    // What the next agent was given: the same three points as summarise in agent/memory.py.
    fix_summary: (blob.changelog.length ? blob.changelog.slice(0, 3) : [blob.failure_pattern]).join("; "),
    scores: blob.scores,
    tier: TIERS[entry.tier],
    // The agent's ranking, so the page matches what retrieval saw.
    confidence: reports ? supported / reports : 0.5,
    supported,
    contradicted,
    supersedes: entry.supersedes === ZERO_ENTRY ? null : entry.supersedes,
    created_at: entry.created_at,
    evidence: evidenceRows(entry_id).map((row) => ({
      ts: row.ts,
      reporter: row.actor,
      supported: row.supported,
      tx: row.tx,
      note: row.supported
        ? `Reported by ${labelOf(agentOf.get(row.actor.toLowerCase()) ?? "agent?")} after a run that inherited this entry.`
        : `Contradicted by ${labelOf(agentOf.get(row.actor.toLowerCase()) ?? "agent?")} after a controlled run with and without this lesson.`,
    })),
    promotions: promotionsOf(entry),
  };
});

// ---------------------------------------------------------------- Chain log

const paid = registry.log.filter((row) => row.event === "RewardPaid").reduce((sum, row) => sum + BigInt(row.amount_wei), 0n);
const chain = {
  exported_at: registry.exported_at,
  block: registry.block,
  log: registry.log.map(({ tier, ...row }) => row),
  balances: {
    agents: registry.balances.authors
      .map(({ address, wei }) => ({ label: labelOf(agentOf.get(address.toLowerCase())), address, wei }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    escrow: registry.balances.escrow,
    total_paid_wei: String(paid),
  },
};

writeFileSync(join(here, "baked.json"), `${JSON.stringify({ runs, memory, chain }, null, 1)}\n`);
console.log(`runs ${runs.length}, events ${runs.reduce((n, r) => n + r.events.length, 0)}, memory ${memory.length}, chain rows ${chain.log.length}`);
for (const m of memory) console.log(m.entry_id.slice(0, 10), m.origin.padEnd(11), m.kind.padEnd(11), m.tier.padEnd(9), m.confidence, `+${m.supported}/-${m.contradicted}`);
