# 04 - Track B: ZK Proof of Improvement (`zk/`)

Owner: Person 3 (ZK + contracts). Tooling: EZKL (Python package `ezkl`), PyTorch to export ONNX, Foundry for verifier tests. **This is the riskiest track. Time-box the first working proof to hour 6 and keep the circuit tiny. If it isn't working by hour 6, Person 2 (agent + bridge) drops what they're doing and helps here — the proof is what the whole pitch rests on.**

## What we prove

> There exist private score vectors `s_old` and `s_new` (4 integers each, 0..100) such that `hash(s_old) = H_old`, `hash(s_new) = H_new`, and `W . s_new > W . s_old`, where `W` is the fixed public weight vector `[40,30,15,15]`.

Public outputs: `H_old`, `H_new`, `improved` (1 if true). The system prompt never enters the circuit. Its `keccak256` is only carried in the memory entry.

## Circuit as an ONNX model

A tiny PyTorch module, exported to ONNX:

```python
class Improve(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer("w", torch.tensor([40., 30., 15., 15.]))
    def forward(self, s_old, s_new):           # each shape (1,4)
        a = (s_old * self.w).sum(dim=1)
        b = (s_new * self.w).sum(dim=1)
        return (b > a).float()                 # 1.0 or 0.0
```

Gotchas to resolve early:
- Strict `>` over floats: with integer inputs the sums are exact, but verify EZKL's quantisation (scale) does not blur adjacent totals. Use `scale=0`-like settings or multiply by a power of two so differences of 1 survive. Test with `S_new = S_old + 1`.
- If the comparison op is awkward, use `relu(b - a)` and a final sign/step trick, or output `b - a` and prove positivity with a range check. Pick whichever EZKL compiles reliably. Document the choice here.
- Inputs visibility: `input_visibility = "hashed"` (so each input vector is committed with Poseidon and only the hash is public), `output_visibility = "public"`, `param_visibility = "fixed"`. Confirm exact settings via `ezkl.gen_settings` with `PyRunArgs`.

Resolved on `ezkl` 23.0.5:
- `b > a` compiles directly at `input_scale = 0`, `param_scale = 0`, `logrows = 15`, so no `relu` trick was needed. Proving takes about 3 s on a laptop CPU.
- The weights share a factor of 5, so the smallest possible change in `S` is 5, not 1. `[1,0,0,0]` vs `[0,1,1,0]` (40 vs 45) is the tightest case and it holds in both directions, as does equality (`improved = 0`).
- A non-improving pair produces a valid proof with `improved = 0`. It does not fail, and the registry rejects it through `instances[2] == 1`.
- The circuit does not range-check scores. `0..100` is enforced in `zk/hash.py`, not in the proof.

## Pipeline (all scripted in `zk/`)

```
zk/export_model.py     -> network.onnx
zk/setup.py            -> settings.json, network.ezkl, kzg.srs (downloaded), vk.key, pk.key, Verifier.sol
zk/prove.py            -> given s_old, s_new json -> proof.json (+ instances), local verify
zk/hash.py             -> poseidon hash of a score vector the same way the circuit does (so the agent can pre-compute H_old/H_new)
zk/calibrate.py        -> if needed
zk/gen_vectors.py      -> shared/test_vectors.json
contracts/test/RealVerifier.t.sol -> Solidity test that deploys Verifier.sol and verifies a baked proof
```

Commands (adjust to the installed `ezkl` version):

```
python zk/export_model.py
python zk/setup.py                 # gen_settings, calibrate_settings, compile_circuit, get_srs, setup
python zk/prove.py --old 70,40,60,55 --new 92,75,60,70 --out zk/out/proof.json
```

`prove.py` must expose a Python function `prove(s_old, s_new) -> {proof_hex, instances, h_old, h_new, improved, proving_ms}` so the agent and bridge can import it, plus a CLI.

## Instances layout (frozen after hour 6)

Confirmed with `ezkl` 23.0.5: `[h_old, h_new, improved]`, three field elements. EZKL prints felts as little-endian hex, so always convert with `felt_to_bytes32` in `zk/hash.py` (big-endian). `prove()` and `shared/test_vectors.json` already use the big-endian form. The registry checks:

- `instances[0] == scoreHashOld`
- `instances[1] == scoreHashNew`
- `instances[2] == 1`

Convert the EZKL hashed-instance field elements to `bytes32` consistently (big-endian, same function used in `hash.py`, the agent, and the contract test). **Write a shared test vector** (`shared/test_vectors.json`) with a known `(s_old, s_new) -> (h_old, h_new, proof)` that all tracks test against.

## Verifier on-chain

- Export with `ezkl.create_evm_verifier`. Commit `contracts/src/Verifier.sol` (generated, with a header saying how).
- It may exceed the EIP-170 size limit or need high gas. If it does: keep the circuit smaller (fewer rows, lower `logrows`), use the reusable/split verifier option if the installed ezkl supports it, and test with `forge test --gas-report`.
- Hand the Chain track: `Verifier.sol`, its ABI function signature, the instance layout, and one valid baked proof within the first 6 hours so they can integrate.

## Prover performance and fallbacks

- Target proving time under 30 s on a laptop CPU. Keep `logrows` as low as correctness permits.
- Pre-generate proofs for every demo task transition and store them in `shared/baked/proofs/`. The `--offline` flow replays them.
- Never block the agent loop on proving. Prove asynchronously, emit `proof.started` and `proof.done`, and let the dashboard show a spinner.
- Download the SRS ahead of time at the venue only if the wifi is solid. Otherwise commit or cache it out of band (do not commit large files; share via drive and document the path).

## Extension: attest the A/B delta (D3)

Reuse the same circuit with `s_old` as B's no-memory V1 vector and `s_new` as B's with-memory V1 vector. Same proof, different framing: "inherited memory provably increased the score." No new circuit needed.

## Definition of done

1. `prove()` returns a valid proof for an improving pair, and fails (or outputs `improved=0`) for a non-improving pair.
2. Foundry test verifies the baked proof against `Verifier.sol`, and rejects a tampered proof.
3. `shared/test_vectors.json` published, instance layout documented here.
4. `zk/README` section in this file kept current with exact versions (`ezkl`, `torch`, `onnx`).

## If the schedule slips

Fallback ladder: (1) minimal circuit proving only `improved` with public hashes, (2) drop hashed inputs and make scores public in the proof while the prompt stays private, (3) as a last resort show a real proof generated and verified locally plus on-chain verifier deployed with a baked proof. Tell judges exactly which level you ship.
