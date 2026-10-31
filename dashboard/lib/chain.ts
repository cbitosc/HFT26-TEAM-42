import type { Address } from "viem";
import deployments from "../../shared/deployments.sepolia.json";
import type { ChainRow } from "./baked";

// Must be a keyless RPC: everything NEXT_PUBLIC_ reaches the browser.
const RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
const REGISTRY = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as Address | undefined;

// Public RPCs reject open-ended getLogs ranges, so logs are read from the deploy block in chunks.
const DEPLOY_BLOCK = BigInt(deployments.deployBlock);
const CHUNK = 5000n;

export const chainConfigured = Boolean(RPC_URL && REGISTRY);
export const VERIFIER_ADDRESS = deployments.verifier;
export const REGISTRY_ADDRESS = deployments.registry;
export const etherscanTx = (tx: string) => `https://sepolia.etherscan.io/tx/${tx}`;
export const etherscanAddress = (address: string) => `https://sepolia.etherscan.io/address/${address}`;

export interface ChainSummary {
  block: number;
  entries: number;
  paidWei: string;
}

// Loaded here so viem stays out of every screen that only needs an Etherscan link.
async function publicClient(url: string) {
  const [{ createPublicClient, http }, { sepolia }] = await Promise.all([import("viem"), import("viem/chains")]);
  return createPublicClient({ chain: sepolia, transport: http(url) });
}

async function readLogs(client: Awaited<ReturnType<typeof publicClient>>, registry: Address) {
  const { parseAbi } = await import("viem");
  const events = parseAbi([
    "event ImprovementRecorded(bytes32 indexed entryId, address indexed author, bytes32 indexed taskSignature, string cid, bool verified)",
    "event EvidencePosted(bytes32 indexed entryId, address indexed reporter, bool supported, uint8 newTier)",
    "event RewardPaid(bytes32 indexed entryId, address indexed to, uint256 amount)",
  ]);
  const latest = await client.getBlockNumber();
  const starts: bigint[] = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK) starts.push(from);
  const chunks = await Promise.all(
    starts.map((fromBlock) => {
      const toBlock = fromBlock + CHUNK - 1n < latest ? fromBlock + CHUNK - 1n : latest;
      return client.getLogs({ address: registry, events, fromBlock, toBlock });
    }),
  );
  return { latest, logs: chunks.flat() };
}

// Read for the status strip. Null without a keyless RPC, so nothing here is ever a guess.
export async function fetchChainSummary(): Promise<ChainSummary | null> {
  if (!RPC_URL || !REGISTRY) return null;
  const { latest, logs } = await readLogs(await publicClient(RPC_URL), REGISTRY);
  const paid = logs.reduce((sum, log) => sum + (log.eventName === "RewardPaid" ? (log.args.amount ?? 0n) : 0n), 0n);
  return { block: Number(latest), entries: logs.filter((log) => log.eventName === "ImprovementRecorded").length, paidWei: String(paid) };
}

// Current wei by address, for the funds panel.
export async function fetchBalances(addresses: string[]): Promise<Record<string, string>> {
  if (!RPC_URL) return {};
  const client = await publicClient(RPC_URL);
  const balances = await Promise.all(addresses.map((address) => client.getBalance({ address: address as Address })));
  return Object.fromEntries(addresses.map((address, i) => [address, String(balances[i])]));
}

// The fallback from docs/06: direct log reads, so the page needs no bridge. Logs carry no time, so
// each block is read once for its timestamp.
export async function fetchChainLog(): Promise<ChainRow[]> {
  if (!RPC_URL || !REGISTRY) return [];
  const client = await publicClient(RPC_URL);
  const { logs } = await readLogs(client, REGISTRY);
  const numbers = [...new Set(logs.map((log) => log.blockNumber))];
  const blocks = await Promise.all(numbers.map((blockNumber) => client.getBlock({ blockNumber })));
  const times = new Map(blocks.map((block) => [block.number, Number(block.timestamp) * 1000]));
  return logs
    .map((log): ChainRow => {
      const base = { ts: times.get(log.blockNumber) ?? 0, entry_id: log.args.entryId ?? "", tx: log.transactionHash ?? "" };
      if (log.eventName === "ImprovementRecorded") {
        return { ...base, event: log.eventName, actor: log.args.author ?? "", cid: log.args.cid, verified: log.args.verified };
      }
      if (log.eventName === "EvidencePosted") {
        return { ...base, event: log.eventName, actor: log.args.reporter ?? "", supported: log.args.supported };
      }
      return { ...base, event: log.eventName, actor: log.args.to ?? "", amount_wei: String(log.args.amount ?? 0n) };
    })
    .reverse();
}
