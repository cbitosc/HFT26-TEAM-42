# 00 - Overview

## Problem

Self-improving agents grade themselves inside closed runtimes. Users cannot tell whether the claimed improvement is real, whether safety constraints were respected, or whether context was deleted. What an agent learns from failures is thrown away instead of shared.

## Our answer, in one sentence

An agent that improves its own output across versions, **proves** each improvement in zero knowledge, **publishes** what it learned as content-addressed memory, and **gets paid** on-chain, while a second agent measurably benefits from that memory.

## Design principles

1. **Scores must be objective and integer.** A ZK proof over a vibes-based LLM score proves nothing. The score comes mostly from a deterministic harness (tests, timing, static checks). The LLM judge contributes one bounded, quantised axis.
2. **Prove the comparison, not the model.** We do not prove LLM inference. We prove that committed score vectors, under a committed weighting, satisfy `new > old`. Honest, cheap, and demo-able.
3. **Commit, don't reveal.** The system prompt and raw score vectors stay private. Hashes of them are public and bound to the on-chain entry.
4. **Memory is earned, not dumped.** Entries have a lifecycle and trust tiers driven by verified evidence.
5. **Failures are first-class.** Regressions and rejected hypotheses are stored and retrieved as negative memory.
6. **Every external dependency has a pre-baked fallback.** Pre-generated proofs, CIDs and tx hashes so the demo never depends on a slow network.

## Scope

### Must ship (judging requirements)

- Multi-stage loop V1 -> V2 -> V3 with automated changelog and measurable gains
- EZKL proof of improvement, verified by a Solidity verifier on Sepolia
- Diffs, critique logs and embeddings on IPFS (Pinata), CID recorded on-chain and bound to the entry (`entryId` commits to the CID, not just stored beside it) — this is what satisfies the PS requirement that the verifier "verifies the IPFS memory commitment"
- Reward escrow that pays the agent wallet on verified improvement
- Second independent agent that reads the registry and inherits fix history
- Dashboard: live execution tree, side-by-side diffs, ZK status, on-chain CID log
- README, clean multi-author commits, deployed demo or video under 3 min

### Differentiators (build after the must-ships work end to end)

- Trust tiers and confidence with decay (D1)
- Negative memory (D2)
- A/B "with vs without memory" experiment with attested delta (D3, **the headline demo**)
- Simple memory view of registry entries (D4, reduced scope)

### Cut list (do not build)

- Proving LLM inference or embeddings in-circuit
- Filecoin deals (IPFS pinning is enough; mention Filecoin as the durability path)
- Multiple chains, token launch, governance voting, memory royalties (D5)
- A DataDAO voting mechanism — trust tiers (candidate -> validated -> trusted -> canonical), driven by verified reuse counts, are our curation substitute. Say this explicitly if a judge asks "where is the DAO"
- User auth

## Task domain

Code generation with a test harness: objective, fast, and visual in diffs. Two task families, reduced from three to fit a three-person team: `lru-cache` (Agent A) and `ttl-cache` (Agent B), a sibling with the same trap classes (capacity-0, `None`/expiry edge cases) so inherited lessons transfer.

## Success criteria

- Agent A improves in at least 2 of 3 task runs, with a visible score curve
- Agent B V1 score with memory beats B V1 without memory on the demo task by a clear margin
- One command runs the end-to-end flow on Sepolia, plus a `--offline` mode replaying baked artifacts
- Judges can click from the dashboard to Sepolia tx, IPFS gateway, and verifier status

## Lessons borrowed from the prior reflections pipeline

- Separate stages: raw observation, falsifiable hypothesis, validation evidence, governed store
- Confidence is computed from evidence, never self-reported by an agent
- Promotion moves one stage at a time, nothing is deleted, only superseded
- Retrieval is small and capped: smallest set of high-confidence entries within a token budget
- Hackathon tuning: promotion thresholds are 1 / 2 / 3 verified reuses, not 10 / 25 / 50, and the registry is pre-seeded with history so the demo has depth
