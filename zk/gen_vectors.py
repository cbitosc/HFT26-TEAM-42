"""Write shared/test_vectors.json, the known-good vector every track tests against."""
import json
from pathlib import Path

from prove import prove

SHARED = Path(__file__).parent.parent / "shared"

CASES = {
    "improved": ([70, 40, 60, 55], [92, 75, 60, 70]),
    "not_improved": ([92, 75, 60, 70], [70, 40, 60, 55]),
}


def main():
    vectors = {
        "weights": [40, 30, 15, 15],
        "instance_layout": ["h_old", "h_new", "improved"],
    }
    for name, (s_old, s_new) in CASES.items():
        result = prove(s_old, s_new)
        result.pop("proving_ms")
        vectors[name] = {"s_old": s_old, "s_new": s_new, **result}
    (SHARED / "test_vectors.json").write_text(json.dumps(vectors, indent=2) + "\n")
    print("wrote", SHARED / "test_vectors.json")


if __name__ == "__main__":
    main()
