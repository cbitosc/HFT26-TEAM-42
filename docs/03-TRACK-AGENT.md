# 03 - Track A: Agent Engine (`agent/`)

Owner: Person 2 (agent + bridge). Language: Python 3.11. Depends on: `02-INTERFACES.md` only. Mock the bridge and ZK with stubs until those tracks land.

## Deliverables

1. `agent/llm.py` - Featherless client. Pinned model ids, `temperature=0`, retries, logs `sha256(prompt)` and `sha256(response)` for every call.
2. `agent/tasks/` - 2 task families (reduced from 3 for a three-person team), each with `spec.md`, visible tests, edge-case tests, a benchmark script, and a `task_signature`.
3. `agent/harness.py` - runs candidate code in a sandbox (subprocess with timeout, no network, tmp dir), returns the integer score vector from `02-INTERFACES.md`.
4. `agent/loop.py` - generate -> score -> critique -> revise, up to V3, with changelog.
5. `agent/memory.py` - retrieval from the bridge, ranking, token-budgeted prompt injection, negative memory handling.
6. `agent/entry.py` - builds the memory entry JSON and the Poseidon score hashes (call into `zk/` helper).
7. `agent/events.py` - emits the SSE/JSONL events defined in the interface doc.
8. `agent/cli.py` - `python -m agent run --task lru-cache --agent A --memory off|on [--offline]`.
9. `agent/experiment.py` - the A/B runner for the headline demo (D3).

## Loop details

```
retrieve (if memory on) -> V1 = generate(spec, lessons, avoid)
for n in 1..2:
    s_n   = harness(V_n)
    crit  = critic(spec, V_n, s_n)          # DeepSeek-R1, structured JSON findings
    V_n+1 = revise(spec, V_n, crit)         # Qwen coder
    s_n+1 = harness(V_n+1)
    if total(s_n+1) > total(s_n): entry(kind=improvement), request proof
    elif total(s_n+1) < total(s_n): entry(kind=regression), keep V_n, store as negative memory
    else:                         keep V_n, record nothing (a tie is not a failure)
```

- Generator and critic are different models. Never let the generator grade itself.
- The critic returns JSON: `{findings:[{severity,issue,suggested_fix}], quality_score:int}`. `quality_score` is axis 3 of the vector. Parse defensively. On parse failure, retry once, then score axis 3 as 0 and log it.
- `changelog` is produced by a third small call that summarises the diff plus critique into bullet points. Cache it. Also run `difflib.unified_diff` to produce the diff deterministically.
- Retry budget: max 2 retries per LLM call. Total wall time per run target: under 3 minutes.

## Scoring harness rules

- `correctness`, `robustness`, `efficiency` are fully deterministic. Same code gives same vector.
- Pin the harness in a Docker image or at least a hashed test directory. Record `test_suite_hash` and `image_digest` in the entry.
- Efficiency: run the benchmark 3 times, take the median, map to 0..100 with a fixed documented curve per task.
- Cap sandbox output and runtime. Treat a crash or timeout as 0 on the affected axes.

## Task design (this decides whether the demo works)

Make tasks where a naive V1 reliably misses edge cases that a critique can find. Examples:

| Signature | Agent | Trap in V1 |
|---|---|---|
| `lru-cache` | A | capacity 0, update-existing-key ordering, `None` values |
| `ttl-cache` | B | capacity 0, `None` values, expiry-boundary timing — shares A's trap classes by design |

Agent B's demo task (`ttl-cache`) is a **sibling** of `lru-cache`, sharing the capacity-0 and `None`-value trap classes, so inherited lessons have real transferable value. Verify by running B without memory several times: V1 must reliably fail some robustness tests that memory would have prevented. If it doesn't, tune the task, not the claim.

## Memory retrieval

Agent B satisfies the PS requirement that a second agent "query the smart contract" directly: it opens its own RPC connection with its own wallet and calls `entriesByTask` / `getEntry` on `MemoryRegistry` itself, then fetches each CID from IPFS, rather than only going through the bridge's `/memory` endpoint. Agent A may still use the bridge's `/memory` endpoint since the PS only requires the *second* agent to query on-chain directly.

1. Call `entriesByTask(taskSignature)` on the registry (own RPC/wallet), or `GET /memory?task=<sig>&k=8` as a fallback/for Agent A. Also query sibling signatures listed in `tasks/siblings.json`.
2. Rank by `tier` (canonical > trusted > validated > candidate) then confidence, then recency.
3. Fit to a token budget (default 800 tokens): include `hypothesis`, `fix summary` and a 3-line diff excerpt. Drop lowest-ranked first.
4. Split into **Lessons** (improvements) and **Avoid** (regressions and contradicted entries).
5. Emit `memory.retrieved` so the dashboard shows what was inherited.
6. After the run, call `/evidence` for each entry that was used: `supported=true` if the final proven delta is positive, else `false`.

## Experiment (D3, the headline)

`experiment.py` runs, for the sibling task: 3 trials of B with memory off, 3 trials with memory on. Output a JSON summary: mean V1 score each way, mean final score each way, and the proven delta. Save to `shared/baked/experiment.json` for the dashboard and the demo.

## Definition of done

- `python -m agent run --task lru-cache --agent A --memory off --offline` completes with realistic events and a baked entry.
- Online run produces V1 -> V3 with at least one clear improvement.
- A and B can run concurrently with different keys.
- No secrets in logs. Every LLM call logged with model id and hashes.

## Stub contracts for parallel work

`--offline` replays fixtures and settles with `BakedSettlement`, which reads and writes `shared/baked/*.json`. Add `--chain` to replay fixtures but settle for real through `ChainSettlement`. `entry.py` uses Poseidon through `zk/hash.py` whenever `ezkl` is installed, and only falls back to a keccak hash flagged `placeholder: true` without it. `ChainSettlement` refuses placeholder entries. `--offline` has no `ttl-cache` V1 or V2 fixtures yet, so `ttl-cache` needs a live LLM.
