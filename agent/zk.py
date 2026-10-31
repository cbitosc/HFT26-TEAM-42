import importlib.util
import sys
from pathlib import Path

ZK_DIR = str(Path(__file__).parent.parent / "zk")


def available():
    return importlib.util.find_spec("ezkl") is not None


def _load():
    if ZK_DIR not in sys.path:
        sys.path.append(ZK_DIR)


def score_hash(scores):
    _load()
    from hash import score_hash as compute

    return compute(scores)


def prove(s_old, s_new):
    _load()
    from prove import prove as compute

    return compute(s_old, s_new)
