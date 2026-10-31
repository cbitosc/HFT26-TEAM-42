# Dashboard handoff

Everything the dashboard needs before deployment, page by page. The agent, contracts and proofs are finished and live on Sepolia, so the dashboard is the main remaining work. Pull `main` first.

**Goal:** a public Vercel link that shows real runs and real results by default, with no sample data presented as real.

`optional` items can be skipped. `docs/08-UI-SUGGESTIONS.md` has further ideas for after this list.

## Real data to use

| What | Where |
|---|---|
| Real Agent A run | `shared/baked/real-a.events.jsonl` |
| Real Agent B run | `shared/baked/real-b.events.jsonl` (once PR #19 is merged) |
| Final A/B result | `shared/baked/experiment.json` |
| Contract addresses | `shared/deployments.sepolia.json` |
| Registry, deployed at block | `0xbF8abaCe162FA3Db70B4C9cb03e03d5B094344B1`, block `12028399` |
| Verifier | `0x83D106D8e5224DCd5Da23Ed2367bcc73723B35d2` |
| Escrow | `0xaE091221A5B143e9aC0E76989Cc052D3708d1F31` |

## 1. Everywhere

- [ ] Change the name to **AutoEvolve**: `components/Dock.tsx`, `components/Story.tsx` (`MOON_WORD` and the first beat), `app/layout.tsx`, `app/not-found.tsx`, `package.json`. The moon currently sits on the dotless `ı` in "Reflections", so it needs a new home. AutoEvolve has no lowercase i, so choose another letter or shape, such as the `o`.
- [ ] Update the repo link in `components/GlassNav.tsx`. Use the submission repo, `HFT26-TEAM-42`, not `reflections`.
- [ ] Remove royalties: `components/ChainLogTable.tsx`, `components/EntryAudit.tsx`, and the `royalty` fields in `lib/baked.ts`.
- [ ] Update the critic model name to `deepseek-ai/DeepSeek-R1-0528`.
- [ ] Add the real data to the mock pipeline, and stop `node mock/generate.mjs` overwriting it. Keep sample runs only if they stay clearly labelled, or remove them.

## 2. Landing page (`components/Story.tsx`, `lib/storyFacts.ts`)

All the numbers here currently come from fake data.

- [ ] Replace the hard-coded `totalScore([70, 40, 60, 55])` and `[92, 75, 60, 70]` with the real run: **9400 to 9850**.
- [ ] `offTotal`, `onTotal` and `delta` now come from the real file: **8050, 9490, +1440**.
- [ ] Remove the word "sample" from lines 59 and 60: use "Median paired trial: 8050 without it, 9490 with it" and "+1440, proven on Sepolia".
- [ ] `storyFacts()` reads `bakedRun("run-a-lru")?.findings.V1[0]`. Use a real finding, or this breaks when that run is removed.
- [ ] Make "Watch a live run" open the real Agent A replay.

## 3. Run (`/run/[runId]`)

This page works well. It only needs real data.

- [ ] Add the real runs to `baked.json` with `"provenance": "replay"`, so hashes link out and the badge reads `replay`. Add `id`, `title`, `task`, `agent`, `models`, `findings` and the parsed `events`.
- [ ] Make the real Agent A run the default.
- [ ] `findings` isn't in the events file. Use `{}` if the inspector handles it, and check that it does.
- [ ] Test: V2 to V3 in `real-a` must show as a regression that keeps V2. In `real-b`, V2 scores 0, and that has to render well.

## 4. Changes (`/run/[runId]/diff`)

- [ ] Check both real runs render their diffs and changelogs. Some real changelog lines are long, so check they wrap.

## 5. Proof (`/run/[runId]/proof`, `components/ProofStepper.tsx`)

- [ ] Line 81 uses `bakedChain.contracts.verifier`, which is a fake address. Use the real verifier.
- [ ] Check the real proof time (about 4 seconds), tx link and reward appear.
- [ ] The regression step has no proof, so check it reads as negative memory and not a failure.
- [ ] Recorded runs have `gateway_url: null`. Build the link from the CID: `https://gateway.pinata.cloud/ipfs/<cid>`. Runs from now on include it.

## 6. Memory (`/memory`)

- [ ] **Real entries can't appear yet.** The page only maps over `bakedMemory`, so anything not already in the mock is dropped. It needs real entries.
- [ ] Add the real registry entries. Person 2 can export these to a JSON file, so ask.
- [ ] Show `AVOID` entries clearly, because negative memory is a key feature.
- [ ] Label entries from rehearsal runs and the two A/B attestation entries, which record a result and aren't lessons.
- [ ] Remove any royalty display in the audit panel.

## 7. Compare (`/experiment`, `components/ExperimentCompare.tsx`)

This is the headline screen, and it needs the most care.

- [ ] **Crash risk:** `ConfidenceChart` reads `bakedExperiment.confidence[0].points`, but the real file has `confidence: []`. Remove the chart or show it only when data exists. Swapping the file without this crashes the page.
- [ ] Line 118 sets `sample = live !== "on"`, so it would label the real result as sample data. Base it on the data: real when `proven.tx` exists.
- [ ] Line 141's hard-coded `verified` badge is now true for the real result, because the pair is on Sepolia. Show it only when `proven.tx` exists, and link it to Etherscan.
- [ ] Inherited entries: `entryById` finds nothing for the real id, so the list renders empty. The real lesson is in `shared/baked/memory_seed.json`.
- [ ] Change the "Mean of {trials} trials, not proven" label. Show the **medians** instead: 8050 and 9415 across all trials. The means are skewed by one broken trial.
- [ ] Add the per-test table from `test_failures`, and keep the bad rows:

| Edge test | Without memory | With memory |
|---|---|---|
| Capacity 0 | 4 of 5 failed | 0 of 5 |
| Negative capacity | 5 of 5 failed | 0 of 5 |
| Zero TTL | 5 of 5 failed | 5 of 5 |
| Expiry boundary | 1 of 5 failed | 5 of 5 |

- [ ] Add one line of honest context: "Measured over 5 trials. The proof shows the score increased, and the trials are the evidence that memory helped."
- [ ] Tell apart the two with-memory numbers. 9490 is the proven pair, and 9415 is the median across all trials.
- [ ] Update `lib/runState.test.ts`, which reads the experiment fixture.

## 8. On-chain (`/chain`, `components/ChainLogTable.tsx`)

- [ ] Set `NEXT_PUBLIC_REGISTRY_ADDRESS` so the page reads real logs without a backend.
- [ ] `fetchChainLog()` starts from block 0, which public RPCs may reject. Start from `12028399`, and read in chunks of 5000 blocks.
- [ ] Live rows have `ts: 0`. Get the timestamp from the block, or hide the column.
- [ ] Balances still come from `bakedChain.balances`, which is fake. Read them live with viem, or remove them.
- [ ] Show a small snapshot as a fallback if the RPC fails, labelled with its date.

## 9. Final checks

- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`
- [ ] No console errors, and every hash and CID opens the right page
- [ ] Check 1280x720, and on a projector if you can
- [ ] `prefers-reduced-motion` still works
- [ ] Delete `app/(landing)/iterations` if it's still there

## 10. Deployment

**The backend doesn't need deploying.** The public site works without it:

| Part | Where it runs |
|---|---|
| Contracts | Already live on Sepolia |
| Memory entries | Already on IPFS |
| Recorded runs and A/B result | Bundled with the dashboard |
| Chain log | Read directly from Sepolia in the browser |
| Dashboard | Vercel |

We're not hosting the agent or bridge because a live run needs a 329 MB proving key, Torch, wallet keys on a public server, and 6 to 12 minutes per run. If a judge wants to see a live run, we run it locally from a laptop.

Vercel settings:

- Root directory: `dashboard`
- `NEXT_PUBLIC_REGISTRY_ADDRESS=0xbF8abaCe162FA3Db70B4C9cb03e03d5B094344B1`
- `NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com`
- Leave `NEXT_PUBLIC_BRIDGE_URL` empty, so no Connect live button appears

**Never put any key or private RPC URL in a `NEXT_PUBLIC_` variable.** Those reach every visitor's browser. That includes the Alchemy URL from our `.env`.

## 11. Video (under 3 minutes)

Record this last, with real data. Follow `docs/07-DEMO-AND-TIMELINE.md`, using the real numbers:

1. Agent A: 9400 to 9850, a real proof, and the reward on Etherscan.
2. Regression: V3 scored lower, so it was rejected and stored as `AVOID`.
3. Agent B reads the contract, and inherits lessons and one `AVOID` entry.
4. Compare: 8050 to 9490 proven on-chain, plus the per-test table.
5. The honest limit, in one line: the proof covers the score comparison, and the trials are the evidence for memory.
