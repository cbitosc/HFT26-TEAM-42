// Exports the live registry to shared/baked/registry.json: every entry with its IPFS blob, every
// event with its block time, and current balances. The dashboard bundles this as its snapshot.
//
// Read-only: no key is loaded and nothing is sent. It uses the same keyless RPC as the browser,
// because viem prints the URL in its errors and a keyed free tier allows only 10 blocks per getLogs.
//
//   node scripts/export-registry.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const shared = join(root, "shared");
const deployments = JSON.parse(readFileSync(join(shared, "deployments.sepolia.json"), "utf8"));
const abi = JSON.parse(readFileSync(join(shared, "abi", "MemoryRegistry.json"), "utf8"));

function fromDotenv(name) {
  const file = join(root, ".env");
  if (process.env[name] || !existsSync(file)) return process.env[name];
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((text) => text.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

const RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const gateway = (fromDotenv("PINATA_GATEWAY") || "gateway.pinata.cloud").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

const CHUNK = 5000n;
const events = parseAbi([
  "event ImprovementRecorded(bytes32 indexed entryId, address indexed author, bytes32 indexed taskSignature, string cid, bool verified)",
  "event EvidencePosted(bytes32 indexed entryId, address indexed reporter, bool supported, uint8 newTier)",
  "event RewardPaid(bytes32 indexed entryId, address indexed to, uint256 amount)",
]);

async function readLogs(latest) {
  const logs = [];
  for (let from = BigInt(deployments.deployBlock); from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    logs.push(...(await client.getLogs({ address: deployments.registry, events, fromBlock: from, toBlock: to })));
  }
  return logs;
}

async function readBlob(cid) {
  for (const host of [gateway, "gateway.pinata.cloud", "ipfs.io"]) {
    try {
      const response = await fetch(`https://${host}/ipfs/${cid}`, { signal: AbortSignal.timeout(20000) });
      if (response.ok) return await response.json();
    } catch {
      // The next gateway may have it.
    }
  }
  return null;
}

const latest = await client.getBlockNumber();
const logs = await readLogs(latest);

const times = new Map();
for (const block of new Set(logs.map((log) => log.blockNumber))) {
  times.set(block, Number((await client.getBlock({ blockNumber: block })).timestamp) * 1000);
}

const rows = logs.map((log) => {
  const base = { ts: times.get(log.blockNumber), block: Number(log.blockNumber), entry_id: log.args.entryId, tx: log.transactionHash };
  if (log.eventName === "ImprovementRecorded") return { ...base, event: log.eventName, actor: log.args.author, cid: log.args.cid, verified: log.args.verified };
  if (log.eventName === "EvidencePosted") return { ...base, event: log.eventName, actor: log.args.reporter, supported: log.args.supported, tier: log.args.newTier };
  return { ...base, event: log.eventName, actor: log.args.to, amount_wei: String(log.args.amount) };
});

const entries = [];
for (const row of rows.filter((item) => item.event === "ImprovementRecorded")) {
  const onChain = await client.readContract({ address: deployments.registry, abi, functionName: "getEntry", args: [row.entry_id] });
  const blob = await readBlob(row.cid);
  // The embedding and diff are large, and a run's events carry the diff already.
  const { embedding, diff, ...kept } = blob ?? {};
  entries.push({
    entry_id: row.entry_id,
    cid: row.cid,
    tx: row.tx,
    block: row.block,
    author: onChain.author,
    verified: onChain.verified,
    tier: onChain.tier,
    supported: onChain.supported,
    contradicted: onChain.contradicted,
    supersedes: onChain.supersedes,
    created_at: Number(onChain.createdAt) * 1000,
    blob: blob ? kept : null,
  });
}

const addresses = [...new Set(entries.map((entry) => entry.author))];
const balance = async (address) => String(await client.getBalance({ address }));
const output = {
  exported_at: Date.now(),
  block: Number(latest),
  log: rows.reverse(),
  entries,
  balances: {
    authors: await Promise.all(addresses.map(async (address) => ({ address, wei: await balance(address) }))),
    escrow: { address: deployments.escrow, wei: await balance(deployments.escrow) },
  },
};

writeFileSync(join(shared, "baked", "registry.json"), `${JSON.stringify(output, null, 1)}\n`);
const missing = entries.filter((entry) => !entry.blob).length;
console.log(`block ${latest}, events ${rows.length}, entries ${entries.length}, blobs missing ${missing}, authors ${addresses.length}`);
