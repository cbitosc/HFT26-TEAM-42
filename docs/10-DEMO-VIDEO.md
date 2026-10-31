# 10 - Demo Video

Everything needed to make the demo video: what to show and what to say. Target length is 3 minutes.

## The one idea

**Agents prove they improved, share what they learned, and catch their own bad lessons.**

If a viewer remembers one thing, it should be the Memory screen moment: a wrong lesson with a valid proof gets caught, marked Disputed, and stops reaching other agents.

## Before you record

- [ ] Open https://autoevolve-one.vercel.app and check every screen loads.
- [ ] Set the browser to full screen at 1920x1080 and hide bookmarks.
- [ ] Open these tabs in order: landing page, `/run/real-a`, `/experiment`, `/memory`, the Etherscan contradiction link below.
- [ ] Keep the script on a second screen. Read it slowly.

## What each part proves

### What the brief asked for

| Deliverable | Where to show it | Scene |
|---|---|---|
| Iterative agent engine (V1, V2, V3) | Run screen | 2 |
| ZK proof of improvement | Run screen, proof step | 3 |
| Decentralized memory registry | Memory screen | 4 |
| On-chain verification and reward escrow | Etherscan or Chain screen | 3 |
| Developer dashboard | The whole video | All |

### What we added beyond it

| Our addition | Why it matters | Scene |
|---|---|---|
| **Self-correcting memory** (the wow) | Bad lessons get caught with evidence and stop spreading | 6 |
| Negative memory | Failures are saved, so the next agent is warned | 4 |
| Trust tiers | A lesson earns trust through reuse by other agents | 4 |
| Measured A/B test | We measured whether memory helps instead of assuming it | 5 |
| Independent reviewers | Different models check the code without knowing each other, and only one judge scores | 2 |

## The script

Each scene gives what to show and the exact words to say.

### Scene 1: The problem (0:00 to 0:20)

**Show:** the landing page, scrolling slowly.

**Say:** "AI agents say they get better, but you have to take their word for it. And when they learn something, that lesson usually disappears. AutoEvolve fixes both."

### Scene 2: The agent improves itself (0:20 to 0:50)

**Show:** `/run/real-a`. Press replay and let the versions appear.

**Say:** "Here an agent writes code, a critic reviews it, and the agent improves it across three versions. Real tests score each version, so the improvement is a number and not an opinion. We can also add independent reviewer models. They don't know each other's names, and they never score, so the grade stays fair."

### Scene 3: It proves the improvement (0:50 to 1:15)

**Show:** the proof step on the run screen, then the Etherscan link for that transaction.

**Say:** "Next the agent creates a zero-knowledge proof that its score went up. A smart contract on Sepolia checks that proof and pays a small reward. This is a real transaction. You can open it and check it yourself."

### Scene 4: Agents share memory (1:15 to 1:40)

**Show:** `/memory`. Point at a card marked avoid, then at the trust tiers.

**Say:** "The lesson is saved to IPFS and registered on-chain. A second agent reads it directly from the chain, not from our server. Failures are saved too, so the next agent knows what to avoid. Lessons earn trust as other agents reuse them."

### Scene 5: We measured it (1:40 to 2:00)

**Show:** `/experiment`.

**Say:** "Does memory help? We tested it. With the same task, the median first-try score was 8050 without memory and 9415 with it."

Do not say all of that gain came from the lesson. Only part of it did.

### Scene 6: The wow, memory corrects itself (2:00 to 2:45)

**Show:** `/memory`, the "Self-correction, on-chain" panel. Open the disputed entry, then the Etherscan contradiction link.

**Say:** "But what if a lesson is wrong? A proof shows a score went up. It doesn't show the explanation is right. So we tested this for real. We put a deliberately wrong lesson on-chain, clearly labelled as a test, with a valid proof attached.

Agent B tested it with and without the lesson. With it, the expiry test failed four times out of five. Without it, zero out of five. So Agent B posted that contradiction on-chain. The lesson is now disputed and stops being recommended, and with it gone, the failure rate went back to zero out of five.

Most systems remember what agents learned. Ours also catches when a lesson was wrong."

### Scene 7: Close (2:45 to 3:00)

**Show:** the landing page or the GitHub repo.

**Say:** "AutoEvolve: agents that prove they improved, share what they learned, and correct their own memory. Everything you saw is live on Sepolia, and you can check every step."

## Links to keep open

- Live site: https://autoevolve-one.vercel.app
- Wrong lesson on-chain: https://sepolia.etherscan.io/tx/0x2e7df1a68a643404b860cc66017c23026c06d3ab6e7d55fbac6e59fbda34aba6
- Contradiction on-chain: https://sepolia.etherscan.io/tx/0x4421fe9585c6e1fd1974066b929405dc72f5432b5a790323b9662c5037c83229

## Lines to avoid

| Don't say | Say instead |
|---|---|
| "The agent's quality is proven" | "The score improvement is proven" |
| "All the gain came from memory" | "Scores were higher with memory" |
| "It catches every bad lesson" | "It caught this planted bad lesson" |
| "Reviewers make the agent better" | "Reviewers give it independent feedback" |

## Publishing the video

1. Upload the video to the team Drive folder: https://drive.google.com/drive/folders/1X0ruFJj3fJQVh-ZephUnmo2QtTJqtX2F?usp=sharing
2. Check the folder is set to **Anyone with the link: Viewer**, then test it in a private window.
3. The README already links to this folder under **Demo video**.
4. Add the same link to the submission PR description.
