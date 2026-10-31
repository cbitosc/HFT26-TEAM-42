# 02 - Interfaces (FROZEN)

This file is the contract between tracks. Each track builds against it with mocks so nobody blocks anybody. **If you must change something, edit this file in a PR titled `interface:` and ping the team.** Machine-readable copies live in `shared/` (schemas, ABIs).

## 1. Score vector

Integers only. Fixed length 4. Each axis is 0..100.

| Index | Axis | Source |
|---|---|---|
| 0 | `correctness` | % of visible unit tests passing |
| 1 | `robustness` | % of edge-case and adversarial tests passing |
| 2 | `efficiency` | scaled runtime/complexity benchmark, 0..100 |
| 3 | `quality` | LLM-judge rubric (critic model), rounded to int, 0..100 |

Weights (baked into the circuit, public in the repo): `w = [40, 30, 15, 15]`. Total score `S = sum(w[i] * s[i])`, range 0..10000.

Improvement rule: `S_new > S_old` (strict). A margin parameter is **not** used in v1.

## 2. Memory entry (the IPFS JSON blob)

Schema in `shared/memory_entry.schema.json`.

```json
{
  "schema": "autoevolve.memory.v1",
  "agent_id": "agentA",
  "agent_address": "0x...",
  "task_signature": "lru-cache",
  "kind": "improvement | regression",
  "from_version": "V1",
  "to_version": "V2",
  "hypothesis": "Handling capacity=0 before insertion removes the crash class",
  "failure_pattern": "KeyError on eviction when capacity is 0",
  "changelog": ["..."],
  "diff": "<unified diff>",
  "critique": { "model": "deepseek-ai/DeepSeek-R1-0528", "findings": ["..."], "raw_hash": "0x.." },
  "scores": { "old": [70,40,60,55], "new": [92,75,60,70] },
  "score_hash_old": "0x<poseidon>",
  "score_hash_new": "0x<poseidon>",
  "weights_version": "w-40-30-15-15",
  "system_prompt_hash": "0x<keccak256>",
  "models": { "generator": "Qwen/Qwen2.5-Coder-32B-Instruct", "critic": "deepseek-ai/DeepSeek-R1-0528", "temperature": 0 },
  "harness": { "image_digest": "sha256:...", "test_suite_hash": "0x.." },
  "embedding": { "model": "all-MiniLM-L6-v2", "dim": 384, "vector": [0.01, "..."] },
  "supersedes": null,
  "parent_cid": null,
  "created_at": 1761800000
}
```

Notes:
- The blob does **not** contain `entry_id`, because `entryId` is derived from the CID (section 3). Order: build blob -> pin -> get CID -> derive `entryId`. Anything that needs the id gets it from the chain or from the bridge response, never from the blob.
- `scores.old/new` in the public blob are for transparency. The **proof** does not need them revealed, only the hashes. For the hackathon the blob includes them (judges can verify the hash). The system prompt itself is never included.
- `kind: regression` entries are negative memory. They are never submitted for reward but are pinned and registered with `proofless = true` so they appear in the registry flagged as unverified negative lessons.

## 3. Smart contracts

Solidity ^0.8.24. Frozen external interface:

```solidity
interface IMemoryRegistry {
    enum Tier { Candidate, Validated, Trusted, Canonical }

    struct Entry {
        address author;
        bytes32 taskSignature;     // keccak256(task_signature string)
        string  cid;               // IPFS CID of the memory entry
        bytes32 scoreHashOld;
        bytes32 scoreHashNew;
        bool    verified;          // false for negative memory
        Tier    tier;
        uint32  supported;         // verified reuse count
        uint32  contradicted;
        bytes32 supersedes;        // entryId or 0
        uint64  createdAt;
    }

    event ImprovementRecorded(bytes32 indexed entryId, address indexed author, bytes32 indexed taskSignature, string cid, bool verified);
    event EvidencePosted(bytes32 indexed entryId, address indexed reporter, bool supported, Tier newTier);
    event RewardPaid(bytes32 indexed entryId, address indexed to, uint256 amount);

    function submitImprovement(
        bytes32 entryId,
        bytes32 taskSignature,
        string calldata cid,
        bytes32 scoreHashOld,
        bytes32 scoreHashNew,
        bytes calldata proof,
        uint256[] calldata instances,   // layout defined in docs/04-TRACK-ZK.md
        bytes32 supersedes
    ) external;

    function submitNegative(bytes32 entryId, bytes32 taskSignature, string calldata cid, bytes32 supersedes) external;

    function postEvidence(bytes32 reusedEntryId, bool supported, bytes32 reporterEntryId) external;
    // reporterEntryId must be a verified entry by msg.sender whose delta justifies the claim.

    function getEntry(bytes32 entryId) external view returns (Entry memory);
    function entriesByTask(bytes32 taskSignature) external view returns (bytes32[] memory);
}
```

- `ProofVerifier`: the unmodified EZKL-exported Solidity verifier. The registry calls it via `verifyProof(bytes proof, uint256[] instances) returns (bool)` (use the signature the exported contract actually has, wrap it if needed).
- `RewardEscrow`: holds ETH. `reward = 0.001 ether` per verified improvement. Per-address daily cap. Owner can top up. No royalty payout (cut for the three-person scope).
- The registry requires `instances` to contain `scoreHashOld`, `scoreHashNew` and `improved == 1`, and rejects reused `entryId`.
- **Memory commitment check** (required by the PS: the verifier must "verify the IPFS memory commitment"): `submitImprovement` requires `entryId == keccak256(abi.encodePacked(cid, scoreHashOld, scoreHashNew, taskSignature, author))`. This binds the on-chain record to the exact CID and scores submitted, not just a CID stored next to an arbitrary id. It does not bind the CID to the proof, so say so if asked.
- Negative entries have no score hashes, so `submitNegative` requires `entryId == keccak256(abi.encodePacked(cid, taskSignature, author))`.
- `author` is `msg.sender` in both checks, so each transaction must be signed with that agent's own key.
- `submitImprovement` rejects a proof that has already been used (`ProofReused`), because a new CID would otherwise give the same proof a new `entryId` and a second reward.
- A proof is not bound to the author's address, so it could be copied from the mempool and submitted from another wallet.

## 4. Bridge HTTP API (`bridge/`, port 8787)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/pin` | memory entry JSON | `{ "cid": "bafy..." }` |
| GET | `/entry/:cid` | | memory entry JSON (via gateway, cached) |
| POST | `/submit` | `{agent_id, entry_id, task_signature, cid, score_hash_old, score_hash_new, proof_hex, instances, supersedes}` | `{ "tx": "0x..", "status": "verified|rejected", "block", "reward_wei", "tier" }`, or `{ "tx": null, "status": "rejected", "reason" }` |
| POST | `/submit-negative` | `{agent_id, entry_id, task_signature, cid, supersedes}` | `{ "tx": "0x.." }` |
| POST | `/evidence` | `{agent_id, reused_entry_id, supported, reporter_entry_id}` | `{ "tx": "0x.." }` |
| GET | `/memory?task=<signature>&k=5` | | ranked entries `[ {entry_id, cid, tier, confidence, entry} ]` |
| GET | `/events` | SSE | live event stream (below) |
| POST | `/events` | one event (section 5) | `{ "ok": true }`. Agents push events here for fan-out to dashboard clients |
| GET | `/health` | | `{ ok, chainId, registry, pinata }` |

`?offline=1` or env `OFFLINE=1` serves baked artifacts from `shared/baked/` instead of hitting Pinata and Sepolia.

## 5. Event stream (SSE, and also appended to `runs/<run_id>/events.jsonl`)

Every event: `{ "ts": <ms>, "run_id": "...", "agent_id": "...", "type": "...", "data": {...} }`

| type | data |
|---|---|
| `run.started` | `{task_signature, memory_enabled}` |
| `memory.retrieved` | `{entries:[{entry_id,cid,kind,tier,confidence,summary}], token_budget}` |
| `node.created` | `{node_id, parent_id, role:"generate|critique|revise|score|prove|pin|submit", version, label}` |
| `node.updated` | `{node_id, status:"running|done|failed", scores?, total?, duration_ms?}` |
| `diff.ready` | `{from, to, unified_diff, changelog}` |
| `proof.started` / `proof.done` | `{from,to}` / `{from,to,proof_hash,proving_ms,verified_locally}` |
| `ipfs.pinned` | `{entry_id, cid, gateway_url}` |
| `chain.tx` | `{entry_id, tx, status:"pending|confirmed|reverted", block?, etherscan_url, reason?}` |
| `chain.verified` | `{entry_id, verifier_ok:true, reward_wei, tier}` |
| `regression.recorded` | `{from,to,reason,entry_id}` |
| `run.finished` | `{final_version, scores_by_version, total_gain}` |

The dashboard must render purely from this stream plus bridge reads. It must never import agent code.

## 6. Environment

`.env.example` (committed), `.env` (never committed):

```
FEATHERLESS_API_KEY=
GENERATOR_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct
CRITIC_MODEL=deepseek-ai/DeepSeek-R1-0528
REVIEW_MODELS=moonshotai/Kimi-K2.5,zai-org/GLM-5
PINATA_JWT=
PINATA_GATEWAY=
SEPOLIA_RPC_URL=
AGENT_A_PRIVATE_KEY=
AGENT_B_PRIVATE_KEY=
DEPLOYER_PRIVATE_KEY=
REGISTRY_ADDRESS=
ESCROW_ADDRESS=
VERIFIER_ADDRESS=
BRIDGE_URL=http://localhost:8787
OFFLINE=0
```

## 7. Repo and branch rules

- `main` is always demo-able. Small PRs, squash merge is fine, but **every member must have their own commits** (judging rule).
- Branch names: `agent/*`, `zk/*`, `chain/*`, `dash/*`, `docs/*`.
- Commit style: `track: what changed` (for example `zk: add score comparison circuit`).
- Do not commit keys, `.env`, proving keys over 50 MB (use release assets or regenerate), or `node_modules`.
