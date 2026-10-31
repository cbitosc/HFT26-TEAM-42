# 07 - Demo and Timeline

Hackathon window: 24 hours from kickoff on 30 Oct 2026. Three people. Times below are hours from kickoff.

## Roles

| Person | Owns | Builds | Hands over |
|---|---|---|---|
| 1 (Frontend) | `dashboard/` | All 6 screens (memory view simplified, see `06-TRACK-DASHBOARD.md`), mock event player, Vercel deploy | Public demo link, demo video |
| 2 (Agent + Bridge) | `agent/`, `bridge/` (Python: FastAPI, web3.py) | LLM loop, scoring harness, 2 task families, memory retrieval (incl. Agent B's direct contract queries), A/B experiment, Pinata upload, SSE events, chain calls | `experiment.json`, recorded runs for replay |
| 3 (ZK + Contracts) | `zk/`, `contracts/` | EZKL proof, `hash.py`, registry and escrow contracts (incl. the `entryId` memory-commitment check), Foundry tests, Sepolia deploy, seed data | `Verifier.sol`, ABIs, instance layout, one valid proof, deployed addresses |

Person 2 writes the README (problem statement, architecture, setup). Everyone makes their own commits — the hackathon rules require commits from **every registered team member**, so if the team is still registered as five, the two not on this split still need commits (docs, tests, or anything genuinely useful).

Hour 0-1 is spent together on `shared/` (schemas, a sample `events.jsonl`) so the frontend can build from the sample while the other two build their parts.

## Timeline

| Hours | Goal | Exit check |
|---|---|---|
| 0-1 | Everyone: repo scaffold, env, `shared/` schemas and a sample `events.jsonl` agreed, accounts for Featherless, Pinata, Sepolia RPC, faucets claimed | Everyone can run hello-world on their track |
| 1-6 | **Vertical slice with stubs.** Person 2: agent loop with `lru-cache` and the harness, bridge `/pin`. Person 3: first EZKL proof + `hash.py`, registry/escrow compiled and tested with a mock verifier. Person 1: layout + mock event player | **Hour 6 gate:** Person 3 has one valid proof, `Verifier.sol`, instance layout, and Person 2 has the loop running with one task. If the proof is missing, Person 2 drops the agent/bridge work and helps on ZK — the proof is what the whole pitch rests on |
| 6-12 | **Real integration.** Agent emits events and calls bridge. Real verifier + registry deployed on Sepolia, including the `entryId` memory-commitment check. Proof submitted from the agent. Dashboard live on the real stream | **Hour 12 gate:** one end-to-end run ends in a confirmed Sepolia tx and a reward. If not, stop all new features until it does |
| 12-17 | Memory: retrieval, negative memory, evidence posting, tiers. Seed script. `ttl-cache` for Agent B, which queries the registry directly with its own wallet. Dashboard: diff view, proof stepper, simplified memory view | **Hour 17 gate:** Agent B with memory runs from the contract and cites inherited entries. If not, simplify the memory view further, but don't cut the A/B demo |
| 17-20 | A/B experiment, bake artifacts, A/B screen, chain log, polish | **Hour 20 gate:** `experiment.json` exists and shows a real gain, dashboard deployed. If not, freeze features and move to bug fixing |
| 20-22 | Bug bash, offline replay, deploy dashboard, verify contracts on Etherscan, README finalised (Person 2), architecture diagram | Cold-start rehearsal works from a clean clone |
| 22-24 | Record the video (under 3 min, Person 1), final rehearsal, submit. Freeze `main` at hour 23 except for fixes | Submission form done early |

If we are behind at any gate: simplify the memory view further, then drop to one task family. Never cut the end-to-end chain flow or the A/B demo — trust tiers and negative memory stay, they're cheap (just counters in the contract).

## Demo script (under 3 minutes)

1. **0:00 Hook (15 s).** "AI agents grade themselves and forget what they learn. We make improvement provable and memory shared."
2. **0:15 Agent A run (50 s).** Start the run on the dashboard. Narrate the tree: generate, score, critique by a different model, revise. Show the diff and the score ribbon going up.
3. **1:05 Proof and chain (40 s).** Proof stepper: proving, CID pinned, Sepolia tx verified, reward paid. Click through to Etherscan and the IPFS gateway.
4. **1:45 Memory (20 s).** Show the memory view: A's entry, tiers, the `entryId` commitment check passing, and a regression stored as "avoid".
5. **2:05 Agent B (45 s).** The A/B screen. B without memory misses edge cases. B with memory scores higher on V1 and the delta is proven on-chain. Point at the inherited entries.
6. **2:50 Close (10 s).** "Verifiable self-improvement, shared memory that earns trust. Open source, MIT."

Say the honest limits once, briefly, in the video or Q&A: the proof covers the comparison over committed scores, and the harness image digest is published for re-running.

## Fallbacks (decide now, not at hour 22)

| Risk | Fallback |
|---|---|
| Featherless slow or rate limited | Replay recorded LLM outputs from `shared/baked/llm_cache/` |
| EZKL proving too slow or flaky | Use pre-generated proofs per transition |
| Verifier too big or too costly on Sepolia | Smaller circuit, or deploy verifier on a cheaper testnet and say so |
| Sepolia RPC or faucet trouble | Backup RPC URL, spare funded wallets, local Anvil fork for rehearsal |
| Pinata gateway slow | Second gateway, local cache, baked entries |
| Venue wifi bad | Everything runs with `OFFLINE=1`. Record the video early as insurance |

## Submission checklist

- [ ] Public repo with clean commits from every registered team member (the three building this split, plus any others on the roster)
- [ ] README: problem statement, architecture diagram, setup instructions, deployed addresses
- [ ] Contracts source-verified on Sepolia, addresses in README
- [ ] Live dashboard link (replay default) and bridge reachable, or video under 3 minutes
- [ ] `shared/baked/` artifacts committed (small files only)
- [ ] `.env.example` present, no secrets in history
- [ ] Original code written during the hackathon, third-party libraries listed in README
- [ ] Team roster and Discord contact verified
