"""Prove W . s_new > W . s_old over Poseidon-committed score vectors.

Instance layout (frozen): [h_old, h_new, improved]. See docs/04-TRACK-ZK.md.
"""
import argparse
import asyncio
import inspect
import json
import tempfile
import time
from pathlib import Path

import ezkl

from hash import felt_to_bytes32, validate_scores

OUT = Path(__file__).parent / "out"


async def _await(result):
    return await result if inspect.isawaitable(result) else result


async def _prove(s_old, s_new):
    validate_scores(s_old)
    validate_scores(s_new)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        data, witness, proof_path = tmp / "input.json", tmp / "witness.json", tmp / "proof.json"
        data.write_text(json.dumps({"input_data": [s_old, s_new]}))

        started = time.perf_counter()
        await _await(ezkl.gen_witness(str(data), str(OUT / "network.ezkl"), str(witness)))
        await _await(
            ezkl.prove(
                str(witness),
                str(OUT / "network.ezkl"),
                str(OUT / "pk.key"),
                str(proof_path),
                str(OUT / "kzg.srs"),
            )
        )
        proving_ms = int((time.perf_counter() - started) * 1000)

        ok = ezkl.verify(
            str(proof_path), str(OUT / "settings.json"), str(OUT / "vk.key"), str(OUT / "kzg.srs")
        )
        if not ok:
            raise RuntimeError("proof failed local verification")
        return json.loads(proof_path.read_text()), proving_ms


def prove(s_old, s_new):
    """Return {proof_hex, instances, h_old, h_new, improved, proving_ms}.

    A non-improving pair still yields a valid proof, with improved=0. The registry rejects it.
    """
    proof, proving_ms = asyncio.run(_prove(s_old, s_new))
    instances = [felt_to_bytes32(felt) for felt in proof["instances"][0]]
    raw = proof["proof"]
    proof_hex = raw if isinstance(raw, str) else "0x" + bytes(raw).hex()
    return {
        "proof_hex": proof_hex if proof_hex.startswith("0x") else "0x" + proof_hex,
        "instances": instances,
        "h_old": instances[0],
        "h_new": instances[1],
        "improved": int(instances[2], 16),
        "proving_ms": proving_ms,
    }


def _vector(text):
    return [int(s) for s in text.split(",")]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--old", type=_vector, required=True, help="e.g. 70,40,60,55")
    parser.add_argument("--new", type=_vector, required=True, help="e.g. 92,75,60,70")
    parser.add_argument("--out", type=Path, default=OUT / "proof.json")
    args = parser.parse_args()
    result = prove(args.old, args.new)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2))
    print(f"improved={result['improved']} proving_ms={result['proving_ms']} wrote {args.out}")
