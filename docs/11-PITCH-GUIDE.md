# 11 - Pitch Guide

## The 20-second pitch

"Self-improving agents ask you to trust them, and what they learn usually disappears. AutoEvolve agents prove their score improved, share lessons on-chain, and catch their own bad lessons. We planted a wrong lesson with a valid proof, and an independent agent caught it and got it disputed on Sepolia."

## The wow factor: self-correcting memory

Most shared memory only adds lessons. Ours can also challenge them.

1. **The trap:** a proof covers a score, not the explanation, so a proven lesson can still be wrong.
2. **The test:** we put a labelled wrong lesson on Sepolia with a real proof of a real gain.
3. **The evidence:** the expiry test failed 4 of 5 runs with the lesson and 0 of 5 without it.
4. **The correction:** Agent B posted a real contradiction, and the lesson became Disputed.
5. **The result:** it stopped being recommended, and failures stayed at 0 of 5.

Say this line: **"Most systems remember what agents learned. Ours also catches when a lesson was wrong."**

## What we built

| Part | What it does |
|---|---|
| Agent engine | Generate, critique and revise across V1, V2 and V3 |
| Objective harness | Scores each version with real tests and a committed weighting |
| ZK proof | Proves the score rose, checked by a contract on Sepolia |
| Decentralized memory | Lessons on IPFS, registered on-chain, read directly by Agent B |
| Reward escrow | Pays a micro-reward for verified improvements |
| Dashboard | Live at https://autoevolve-one.vercel.app |

## What goes beyond the brief

- **Self-correcting memory:** bad lessons get caught with evidence.
- **Negative memory:** failures are saved as warnings.
- **Trust tiers:** lessons earn trust through reuse.
- **A/B test:** median first-try scores were 8050 without memory and 9415 with it.
- **Independent reviewers:** models review without knowing each other, and one fixed judge keeps scores comparable.
- **Critique reputation:** tracks how revisions go after each reviewer advises.

## Likely questions

**Does the proof show the code is good?**
No. It shows the score rose under a committed weighting. Nothing yet proves the tests were really run, and that's our biggest known limit.

**Why not let every model score?**
A total could rise just because the grader changed. So reviewers only give findings, and one judge scores every version.

**Could someone attack a good lesson?**
A contradiction needs a verified entry from the reporter, and each wallet can report once per entry. A colluding set of wallets is still a risk.

**Would it catch every bad lesson?**
No. We showed it on one known-bad case with a test that covers the behaviour. A bad lesson with no matching test wouldn't be caught this way.

**Did memory cause the whole A/B gain?**
No. Of the proven +1,440, only 240 came from robustness, which is what the lesson addresses.

**Do the reviewers improve results?**
Quote only the finished `review-experiment` numbers here. Until then, say it's still being measured.

**What's next?**
Prove that the tests ran, add more tasks, and let the reputation score decide which reviewers get used.
