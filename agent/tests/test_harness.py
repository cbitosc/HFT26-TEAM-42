from pathlib import Path

from agent.harness import WEIGHTS, score, test_suite_hash as suite_hash, total_score

FIXTURES = Path(__file__).parent.parent / "fixtures"


def fixture(version):
    return (FIXTURES / f"lru_cache_{version}.py").read_text(encoding="utf-8")


def test_naive_scores_low_on_robustness():
    result = score(fixture("v1"), "lru-cache")
    assert result.scores[0] == 100
    assert result.scores[1] < 70
    assert "test_none_value_is_stored" in result.failed_tests


def test_correct_solution_gets_full_marks():
    result = score(fixture("v3"), "lru-cache", quality=80)
    assert result.scores == [100, 100, 100, 80]
    assert result.failed_tests == []


def test_versions_improve_in_order():
    totals = [score(fixture(v), "lru-cache").total for v in ("v1", "v2", "v3")]
    assert totals[0] < totals[1] < totals[2]


def test_same_code_gives_same_scores():
    assert score(fixture("v3"), "lru-cache").scores == score(fixture("v3"), "lru-cache").scores
    assert score(fixture("v2"), "lru-cache").scores == score(fixture("v2"), "lru-cache").scores


def test_syntax_error_scores_zero():
    assert score("def broken(:", "lru-cache", quality=50).scores == [0, 0, 0, 50]


def test_hang_scores_zero():
    code = "class LRUCache:\n    def __init__(self, capacity):\n        while True: pass\n"
    assert score(code, "lru-cache").scores[:3] == [0, 0, 0]


def test_candidate_cannot_see_secrets(monkeypatch):
    monkeypatch.setenv("FEATHERLESS_API_KEY", "sk-secret")
    code = (
        "import os\n"
        "assert 'FEATHERLESS_API_KEY' not in os.environ\n"
        + fixture("v3")
    )
    assert score(code, "lru-cache").scores[0] == 100


def test_candidate_cannot_open_sockets():
    code = "import socket\nsocket.socket()\n" + fixture("v3")
    assert score(code, "lru-cache").scores[0] == 0


def test_candidate_cannot_forge_result_with_print():
    code = "print('{\"passed\": 99, \"total\": 99, \"failed\": []}')\n" + fixture("v1")
    assert score(code, "lru-cache").scores[1] < 70


def test_total_uses_frozen_weights():
    assert WEIGHTS == (40, 30, 15, 15)
    assert total_score([92, 75, 60, 70]) == 7880


def test_suite_hash_is_stable():
    assert suite_hash("lru-cache") == suite_hash("lru-cache")
    assert suite_hash("lru-cache").startswith("0x")
