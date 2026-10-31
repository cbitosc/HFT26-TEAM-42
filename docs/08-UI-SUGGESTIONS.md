# UI suggestions for the dashboard

These ideas come from the ShadowLens frontend design deck, which is another project and unrelated to our problem statement. Take the ideas, not the deck: don't copy its branding, text or layouts. Our code has to be original, and our dusk palette and landing page should stay.

Do the fix list first (real A/B numbers, remove the hard-coded "verified" badge and fake lessons, remove royalties, AutoEvolve wordmark). Everything here comes after that, and all of it is optional.

## Do these first

Each one uses data we already have and makes the claims easier to trust.

### 1. "Proven, and not proven" panel on the Proof screen

ShadowLens has a Capture screen with "can see" and "cannot see" columns. Use the same idea for our claims:

| Proven | Not proven |
|---|---|
| The committed score went up | That the harness ran honestly |
| The CID is bound to this entry on-chain | That the proof is bound to the CID or the author |
| The reward was paid after verification | That memory caused the gain |

Judges will ask about these limits. Showing them first builds trust. The wording is in the README under "Known limits".

### 2. Test-by-test table on the Compare screen

ShadowLens has an Evidence tab listing each metric with its result. Ours can show `test_failures` from `shared/baked/experiment.json`:

| Edge test | Without memory | With memory |
|---|---|---|
| Capacity 0 | 4 of 5 failed | 0 of 5 |
| Negative capacity | 5 of 5 failed | 0 of 5 |
| Zero TTL | 5 of 5 failed | 5 of 5 |
| Expiry boundary | 1 of 5 failed | 5 of 5 |

Keep the bad rows visible, because that honesty is the strongest part of the result. Under the table, add a Sepolia link built from `proven.tx`, and label it clearly: "Median pair proven on-chain: 8050 to 9490".

Don't mix up the two figures. 9415 is the median total with memory across all trials. 9490 is that one proven pair's score.

### 3. "Why this score" breakdown

ShadowLens lets you click a score and see every step behind it, ending with "every number comes from a rule the reader can open". Do this when someone clicks a version's total:

```
correctness  100 x 40 = 4000
robustness    83 x 30 = 2490
efficiency   100 x 15 = 1500
quality      100 x 15 = 1500
total                   9490
```

Weights are `[40, 30, 15, 15]`. This one panel explains the score to a judge in a few seconds.

### 4. Always-visible status strip

ShadowLens keeps a thin strip under the nav on every screen. Ours could show:

`Sepolia · block 12,029,091 · Registry 0xbF8a…44B1 · Bridge connected · 8 entries · 0.008 ETH paid · Live, Replay or Sample`

Read the values live and don't hard-code the ones above. The mode label matters most, because it stops sample data ever looking real.

## Next, if there's time

### 5. Memory entry side panel

ShadowLens opens an alert in a side panel with its own link (`?alert=id`), so the list stays in place. Do the same on Memory with `?entry=id`: CID, verified status, tier, evidence count, score change, and a collapsible "what the next agent received" showing the exact prompt text. The link is useful in the video and in Q&A.

### 6. The four screen states

ShadowLens defines the same four states for every screen. Check that each of our screens has them:

- **Empty:** says what to do next, with a button.
- **Loading:** plain text, no skeletons.
- **Error:** says what failed, with Retry.
- **Disconnected:** keeps the last good data and shows its timestamp, for example "as of 01:58".

The last one matters most if the venue wifi drops during the demo.

### 7. Consistent visual meaning

ShadowLens uses one pattern everywhere: hatching always means "not seen". It also shows severity by shape and text, not by colour alone. For us:

- Make dashed or hatched always mean sample or unverified.
- Make solid mean on-chain.
- Pair every status colour with an icon or word, which also helps on a projector.

### 8. One-click recorded run

ShadowLens has Load, Play and Reset controls in the top bar. Add a simple "Play real run" control that replays `shared/baked/live-a.events.jsonl`, so a judge can see the flow without a bridge. Label it `replay`.

### 9. Toasts for chain moments

Show one short toast for "Proof verified" and one for "Reward paid: 0.001 ETH", each linking to Etherscan. Stack no more than 3, and don't toast every event.

## Worth stealing for planning

**Requirement checklist.** The deck ends with a table mapping every requirement to a screen. Use it for the rehearsal:

| PS requirement | Screen | Done |
|---|---|---|
| Real-time execution tree | Run | [ ] |
| Side-by-side version diffs | Changes | [ ] |
| ZK verification status | Proof | [ ] |
| On-chain memory CID log | On-chain | [ ] |
| Live on-chain logs | On-chain | [ ] |
| Second agent inherits fix history | Memory, Compare | [ ] |

## Leave these out

- **On/off master toggle:** it suits a monitoring product, and we have nothing to switch.
- **Permission matrix and compliance scoring:** these are specific to their product.
- **Eight-screen navigation:** our six screens are enough.
- **Light paper theme:** our dark dusk look is more distinctive.
- **Their risk gauge:** a single big number with no explanation is what we're arguing against.
