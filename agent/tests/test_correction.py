import pytest

from agent import correction, memory



@pytest.mark.parametrize(
    "without,with_lesson,trials,expected",
    [
        (0, 5, 5, "contradicted"),
        (1, 5, 5, "contradicted"),
        (0, 3, 5, "inconclusive"),
        (3, 5, 5, "inconclusive"),
        (0, 0, 5, "not_contradicted"),
        (0, 2, 2, "inconclusive"),
    ],
)
def test_a_lesson_is_blamed_only_on_a_controlled_difference(without, with_lesson, trials, expected):
    assert correction.verdict(without, with_lesson, trials) == expected


def lesson(number, disputed=False):
    return {
        "entry_id": number,
        "kind": "improvement",
        "tier": "Trusted",
        "confidence": 1.0,
        "created_at": number,
        "disputed": disputed,
    }


def test_a_disputed_lesson_is_never_recommended_whatever_its_tier():
    assert [item["entry_id"] for item in memory.select([lesson(1, disputed=True), lesson(2)])] == [2]


def test_the_bridge_path_drops_disputed_entries():
    entry = {"task_signature": "ttl-cache", "kind": "improvement", "to_version": "V2", "created_at": 1, "changelog": ["x"]}
    ranked = [
        {"entry_id": "0x1", "cid": "a", "tier": "Trusted", "confidence": 1.0, "entry": entry, "disputed": True},
        {"entry_id": "0x2", "cid": "b", "tier": "Candidate", "confidence": 0.5, "entry": entry},
    ]
    assert [item["entry_id"] for item in memory.retrieve_bridge("ttl-cache", lambda path: ranked)] == ["0x2"]


def test_a_run_without_gain_posts_no_contradiction():
    from agent.settlement import ChainSettlement

    settlement = ChainSettlement.__new__(ChainSettlement)
    settlement.reporter_entry_id = "0xreporter"
    settlement.send_evidence = lambda *args: pytest.fail("must not post evidence")
    settlement.post_evidence([{"entry_id": "0x1"}], False)


def test_probe_counts_only_the_named_test(monkeypatch):
    class FakeLLM:
        def complete(self, role, system, user):
            return "```python\nx = 1\n```"

    class Result:
        def __init__(self, failed):
            self.failed_tests = failed

    calls = iter([[], ["t"], ["other"], ["t"], [], ["t"]])
    monkeypatch.setattr(correction.harness, "score", lambda code, signature: Result(next(calls)))
    result = correction.probe(FakeLLM(), "ttl-cache", {**correction.PLANTED_TTL, "test": "t"}, 3)
    assert (result["failed_without"], result["failed_with"], result["verdict"]) == (0, 3, "contradicted")
