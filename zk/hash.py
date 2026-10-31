"""Poseidon hash of a score vector, computed the same way the circuit does.

EZKL felts are little-endian hex. Everything outside ezkl (agent, bridge, contracts)
uses the big-endian bytes32 form from felt_to_bytes32.
"""
import argparse

import ezkl


def validate_scores(scores):
    """The circuit does not range-check scores, so reject bad vectors here."""
    if len(scores) != 4 or any(not isinstance(s, int) or not 0 <= s <= 100 for s in scores):
        raise ValueError(f"score vector must be 4 ints in 0..100, got {scores}")


def felt_to_bytes32(felt):
    return ezkl.felt_to_big_endian(felt)


def score_hash(scores):
    """Return the 0x-prefixed bytes32 commitment for a score vector."""
    validate_scores(scores)
    felts = [ezkl.float_to_felt(float(s), 0) for s in scores]
    return felt_to_bytes32(ezkl.poseidon_hash(felts)[0])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("scores", help="comma-separated, e.g. 70,40,60,55")
    print(score_hash([int(s) for s in parser.parse_args().scores.split(",")]))
