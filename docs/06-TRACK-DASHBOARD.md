# 06 - Track D: Developer Dashboard (`dashboard/`)

Owner: Person 1 (frontend, sole owner of this track). Stack: Next.js 14 (App Router), TypeScript, Tailwind, `framer-motion`, `reactflow`, `viem`, a diff viewer (`react-diff-viewer-continued` or Monaco diff), `recharts` or `visx` for charts. The UI is a big part of how we get remembered. Spend real time on it, but build against the event contract and mocks from minute one.

## Principles

- Renders **only** from the SSE stream (`/events`) and bridge reads. Never imports agent code.
- Ships with a **mock event player** (`dashboard/mock/`) that replays a recorded run on a timer. UI work never waits for the agent, the prover or the chain.
- Every number and hash is clickable to its source: Sepolia tx on Etherscan, CID on the IPFS gateway, contract on Etherscan.
- Honest labels: `live`, `replay`, `baked`, `unverified`. Never show baked data as live.
- Dark theme first, high contrast, one accent colour for "verified", one for "regression". Respect `prefers-reduced-motion`.

## Screens

### 1. Run view (the main stage)

Layout: left rail, centre canvas, right inspector.

- **Execution tree (centre).** `reactflow` graph built from `node.created` and `node.updated`. Nodes: retrieve, V1 generate, score, critique, revise, V2, ..., prove, pin, submit. Edges animate as work flows. Node colour reflects status (running pulse, done, failed). Regression branches render in the warning colour with a "kept V1" marker.
- **Score ribbon (top).** Four axis bars plus the weighted total per version, animating V1 -> V2 -> V3 (a small radar chart per version is a good flourish). Show the gain as `+N` with a count-up.
- **Inspector (right).** Click any node to see: prompt hash, model id, duration, raw output (collapsed), scores.
- **Memory panel (left).** Lists inherited entries from `memory.retrieved` with tier badge and confidence meter, split into Lessons and Avoid. Hover shows the hypothesis.

### 2. Diff view

Side-by-side V1 -> V2 -> V3 with a version scrubber. Changelog bullets pinned alongside, each linked to the critique finding that caused it (match by `finding` index if available). Toggle unified or split.

### 3. Proof and chain panel

A vertical stepper per improvement: `proving -> proof ready -> pinned (CID) -> tx pending -> verified on-chain -> reward paid`. Show proving time, proof size, verifier address, tx hash, block, reward in ETH. Failures show the revert reason in plain words.

### 4. Memory view (simplified differentiator)

Reduced in scope for a three-person team: a flat, sortable/filterable list of registry entries for a task signature, not a force graph. Each row: tier badge, confidence meter, `supersedes` shown as a small "supersedes #..." link rather than a drawn edge, red row styling for contradicted or negative memory. Click a row for its audit trail panel: author, CID, scores, evidence timeline, tier promotions, and whether its `entryId` commitment check passed (the CID-to-entry binding described in `02-INTERFACES.md`) — label this clearly so judges can see the on-chain memory-commitment check, not just a stored CID.

### 5. A/B experiment (the headline slide)

Two columns, "Agent B without memory" and "Agent B with inherited memory", for the sibling task. Show V1 scores per axis, the delta, the proven-delta badge (links to the proof tx), and the exact entries that were inherited. A confidence-over-time chart for those entries sits below. This screen should be screenshot-worthy and be the last thing shown in the demo.

### 6. Chain log

Live table of `ImprovementRecorded`, `EvidencePosted`, `RewardPaid` with CIDs, authors, timestamps, and filters. A small header strip shows agent wallet balances, escrow balance, and total rewards paid.

## Components checklist

`RunCanvas`, `ScoreRibbon`, `RadarMini`, `NodeInspector`, `MemoryPanel`, `DiffViewer`, `ChangelogList`, `ProofStepper`, `MemoryList` (the simplified memory view, replacing a force-graph `MemoryGraph`), `ExperimentCompare`, `ChainLogTable`, `HashChip` (copy and link), `StatusBadge`, `LiveBadge`.

## Data layer

- `useEventStream(runId?)` hook: SSE with auto-reconnect, buffers into a reducer keyed by run, exposes derived tree, scores, diffs and chain state.
- `bridge` client for `/memory`, `/entry/:cid`, `/health`.
- `viem` public client on Sepolia for direct log reads as a fallback if the bridge stream is down.
- A run picker lists runs from `shared/baked/` plus live ones.

## Design system (frozen — do not improvise colours or type mid-build)

This is a judging requirement in disguise: "stunning UI" is a tiebreaker against teams who ship a JSON dump with a progress bar. Treat this section like `02-INTERFACES.md` — one person owns it, everyone else consumes it as Tailwind tokens, nobody freelances a new colour or font at hour 20.

**Identity.** Not a crypto-dashboard template, not an admin panel. The reference feeling is a cathode-glow lab instrument: dark, precise, slightly alive, reads clearly on a projector from the back of a room.

**Colour tokens** (`tailwind.config` extend, also as CSS vars for non-Tailwind spots):

| Token | Hex | Use |
|---|---|---|
| `bg-0` | `#07080B` | page background |
| `bg-1` | `#0D0F14` | panel background |
| `bg-2` | `#15181F` | raised card / hover |
| `line` | `#242833` | hairline borders |
| `text-hi` | `#EDEFF4` | primary text |
| `text-lo` | `#8A8F9C` | secondary text |
| `accent` | `#5EE6C8` | verified / success / "proven" — the signature colour, used sparingly so it still pops |
| `accent-dim` | `#2A4A44` | accent at low emphasis (borders, backgrounds) |
| `warn` | `#F2A65A` | regression / negative memory / pending |
| `danger` | `#F05D6B` | failed / reverted / contradicted |
| `chain` | `#8E7CF0` | on-chain-specific elements (tx, verifier, Etherscan links), keeps "proof" and "chain" visually distinct |

Rule: a screen uses at most 2 of {accent, warn, danger, chain} active at once, plus neutrals. If everything is glowing, nothing reads as a signal.

**Type.** `Geist` or `Inter` for UI text, `JetBrains Mono` or `IBM Plex Mono` for everything that is a hash, address, CID, score, or code (diffs, score ribbon numbers, node ids). This split alone is what makes it look like a serious systems tool instead of a marketing page. Scale: 12 / 13 / 15 / 18 / 24 / 36px, line-height 1.4 for body, 1.1 for numerics. Numbers that animate (scores, counters) are tabular-nums so digits don't jitter sideways.

**Grid and spacing.** 8px base unit. Panels sit on a 12-column grid with 24px gutters, 1px hairline `line` borders (never heavy drop shadows — depth comes from background-layer contrast: `bg-0` < `bg-1` < `bg-2`). Corner radius 10px on cards, 6px on chips/badges, full round on status dots.

**Signature visual motifs** (pick 2-3, execute them well rather than attempting all):
1. **Glow on verified.** A node, badge or stepper step that reaches "verified on-chain" gets a short (300ms) outward `accent` glow pulse once, then settles to a thin steady accent border. Never a permanent pulsing glow — that reads as "still loading," not "done."
2. **Scanline / hash-chip texture.** Hash and CID chips (`HashChip`) show a truncated monospace value (`0x4f2a…9c1`) with a tiny copy icon and an external-link icon; on hover the full value fades in via tooltip. This recurs everywhere (nodes, chain log, proof stepper) so the eye learns the pattern once.
3. **Count-up numerics.** Score totals and the A/B delta count up from the old value to the new one over ~600ms with an ease-out, never a hard cut. This is the single highest-leverage animation in the whole app — it's what sells "the agent actually got better" in the demo video.

**Motion rules.** 150-250ms for hovers/focus, 400-600ms for state transitions (node completing, stepper advancing), 600-900ms for narrative beats (count-ups, graph layout settling). Nothing loops indefinitely except a genuine "running" spinner. Respect `prefers-reduced-motion`: swap all of the above for instant state changes, no exceptions.

**Iconography.** One icon set only (`lucide-react`). No emoji anywhere in the shipped UI.

**Landing / home.** One screen, no scroll-chasing: a one-line thesis ("Self-improving agents that prove it, and remember it, together."), the 4-step mechanism as a tiny inline diagram (not prose), and one primary action — "Watch a live run" — which starts the baked replay immediately. This is what judges see first if they click the demo link cold; it must explain the whole idea in under 10 seconds of reading.

**Responsiveness.** Design and test at 1280x720 first (projector/screen-share reality), then confirm it doesn't break below that. Not a mobile-first product — don't spend time on phone layouts.

## Look and feel — execution notes

- Motion tells the story: nodes appear in order, edges draw, scores count up, the proof stepper ticks. Keep durations per the motion rules above.
- Every screen in section "Screens" above is a consumer of the tokens here, not a place to introduce new ones. If a screen seems to need a new colour, it's a sign the information should be encoded as a badge/label instead.

## Definition of done

1. Replay of a baked run animates the full tree, scores, diffs, proof stepper and chain log with no backend.
2. Live mode connects to the bridge SSE and renders a real run.
3. Memory view and A/B screens render from `seed.json` and `experiment.json`.
4. No console errors, all hashes link out correctly, Lighthouse accessibility check passes basic contrast.
5. Deployed (Vercel or similar) with `NEXT_PUBLIC_BRIDGE_URL` and a baked-replay default, so a public demo link works even if the live bridge is down.
