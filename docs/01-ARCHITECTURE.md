# 01 - Architecture

## Components

```
 +--------------------+     events (SSE)      +-------------------+
 |  Agent engine (Py) | --------------------> |  Dashboard (Next) |
 |  gen / critic /    |                       |  tree, diffs, ZK, |
 |  reviser / scorer  |                       |  chain log, graph |
 +----+----------+----+                       +---------^---------+
      |          |                                      |
      | scores   | memory entry (JSON)                  | reads
      v          v                                      |
 +---------+  +---------+   CID    +------------------------------+
 |  ZK     |  | Bridge  | -------> | Sepolia                      |
 |  EZKL   |  | Pinata  |  tx      | MemoryRegistry               |
 |  proof  |  | + chain | -------> | ProofVerifier (EZKL export)  |
 +----+----+  +----+----+          | RewardEscrow                 |
      |  proof     ^               +------------------------------+
      +------------+                      ^
                                          | query by task_signature
                                 +--------+--------+
                                 | Agent B (Py)    |
                                 | memory-augmented|
                                 +-----------------+
```

## One improvement cycle, step by step

1. **Retrieve** (only if memory is on). Query `MemoryRegistry` by `task_signature`, fetch top-k CIDs from IPFS, rank by tier and confidence, fit token budget, and inject into the generator prompt as "lessons" and "avoid" lists.
2. **Generate V1** with the generator model (pinned, temperature 0).
3. **Score V1** with the harness. Output an integer vector `s1`.
4. **Critique** with the independent critic model. Output structured findings.
5. **Revise** to V2 with the generator, given the critique. Auto-generate a changelog from the diff plus critique.
6. **Score V2**, giving `s2`. Repeat for V3.
7. **Decide per step**: if `score(Vn+1) < score(Vn)`, record a **negative memory entry** (the hypothesis failed), keep Vn, and do not request a reward. A tie keeps Vn and records nothing, because a harmless refactor is not a failure worth avoiding.
8. **Prove** each improving step with EZKL (`s_old`, `s_new` private and hashed, weights baked in, output `improved`).
9. **Assemble the memory entry** (diff, critique, changelog, embedding, hashes, proof reference), then pin it to IPFS through the bridge. Get a CID.
10. **Submit on-chain**: `submitImprovement(entryId, cid, proof, instances, ...)`. The registry calls the verifier, checks the commitments against the entry, records the CID, and the escrow pays the agent wallet.
11. **Emit events** at every step so the dashboard updates live.

## Memory entry lifecycle

```
candidate --(1 verified reuse)--> validated --(2)--> trusted --(3)--> canonical
    |                                |
    +--(contradicted evidence)--> demoted / deprecated (never deleted, can be superseded)
```

- Evidence is posted on-chain when an agent reuses an entry and reports a verified outcome (`supported` if its proven delta is positive, `contradicted` if it regressed).
- Confidence is computed off-chain from the evidence log with recency weighting and decay, and shown in the dashboard. The on-chain tier is derived from counts only, to keep gas low and the rule auditable.
- Entries are append-only. `supersedes` links form the graph.

## Where trust comes from

| Claim | Mechanism |
|---|---|
| Score went up | EZKL proof over committed score vectors, verified on-chain |
| Score vectors are the real ones | Poseidon hash of vectors is a public instance and must equal the hash stored in the IPFS entry |
| Rubric was not tweaked after the fact | Weights are baked into the circuit, the circuit's verifying key is registered once in the registry |
| Memory was not edited later | Content addressing: CID is the hash of the entry, and the CID is on-chain |
| CID actually belongs to this entry, not swapped after the fact | `entryId = keccak256(cid, scoreHashOld, scoreHashNew, taskSignature, author)`, checked by the registry on submit |
| System prompt kept secret | Only `keccak256(systemPrompt)` is public |
| Reward is not replayable | `entryId` is unique and a used-proof guard rejects duplicates |

## Honest limits (say these out loud in the demo, it builds credibility)

- The proof shows the comparison over committed scores. It does not prove the harness ran honestly. Mitigation: harness inputs, outputs and a Docker image digest are in the IPFS entry so anyone can re-run and compare to the committed hash.
- LLM outputs are not guaranteed bit-identical at temperature 0, so we store the real outputs and prove over the stored scores.

## Tech choices

| Area | Choice | Why |
|---|---|---|
| Agent | Python 3.11, `httpx`, `pydantic` | Fast to write, EZKL has a Python API |
| LLM | Featherless API: `Qwen/Qwen2.5-Coder-32B-Instruct` generator, `deepseek-ai/DeepSeek-R1-0528` critic | Matches the suggested adversarial separation |
| Embeddings | Small local model (`sentence-transformers/all-MiniLM-L6-v2`) | Free, offline, deterministic enough |
| ZK | EZKL (Halo2) with Solidity verifier export | Fastest path to an on-chain verifier |
| Chain | Sepolia, Foundry | Faucets, Etherscan, fast tests |
| Storage | Pinata IPFS | Simple SDK, public gateway for judges |
| Dashboard | Next.js 14, Tailwind, `framer-motion`, `reactflow`, `diff2html` or `monaco` diff, `viem` | Great visuals quickly |
