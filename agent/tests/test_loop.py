import json

import pytest

import httpx

from agent import events, loop
from agent import memory as memory_module
from agent.events import EventSink
from agent.llm import OfflineClient
from agent.settlement import BakedSettlement

AUTHOR = "0x" + "00" * 20


def run_offline(tmp_path, monkeypatch, scenario="clean", memory=False):
    monkeypatch.setattr(events, "RUNS_DIR", tmp_path)
    sink = EventSink("run", "agentA")
    tree = loop.Tree(sink)
    best = loop.run(
        OfflineClient("lru-cache", scenario), sink, BakedSettlement(sink, tree), tree,
        "lru-cache", "agentA", AUTHOR, memory,
    )
    lines = sink.path.read_text(encoding="utf-8").splitlines()
    return best, [json.loads(line) for line in lines]


def of_type(stream, event_type):
    return [e for e in stream if e["type"] == event_type]


def test_clean_run_improves_twice(tmp_path, monkeypatch):
    best, stream = run_offline(tmp_path, monkeypatch)
    assert best.name == "V3"
    assert len(of_type(stream, "chain.verified")) == 2
    assert of_type(stream, "regression.recorded") == []
    assert of_type(stream, "run.finished")[0]["data"]["total_gain"] > 0


def test_regression_keeps_previous_version(tmp_path, monkeypatch):
    best, stream = run_offline(tmp_path, monkeypatch, "regression")
    recorded = of_type(stream, "regression.recorded")
    assert len(recorded) == 1 and recorded[0]["data"]["from"] == "V1"
    assert best.name == "V3"
    assert of_type(stream, "diff.ready")[1]["data"]["from"] == "V1"


def test_unchanged_revision_stops_without_a_regression(tmp_path, monkeypatch):
    monkeypatch.setattr(events, "RUNS_DIR", tmp_path)
    llm = OfflineClient("lru-cache")
    v1, v2, _ = list(llm.outputs)
    llm.outputs = iter([v1, v2, v2])
    sink = EventSink("run", "agentA")
    tree = loop.Tree(sink)
    best = loop.run(llm, sink, BakedSettlement(sink, tree), tree, "lru-cache", "agentA", AUTHOR, False)
    stream = [json.loads(line) for line in sink.path.read_text(encoding="utf-8").splitlines()]
    assert best.name == "V2"
    assert of_type(stream, "regression.recorded") == []


def test_every_settled_output_is_labelled_baked(tmp_path, monkeypatch):
    _, stream = run_offline(tmp_path, monkeypatch)
    for name in ("proof.done", "ipfs.pinned", "chain.tx", "chain.verified"):
        assert all(e["data"]["baked"] for e in of_type(stream, name))


def test_memory_on_emits_retrieved_entries(tmp_path, monkeypatch):
    _, stream = run_offline(tmp_path, monkeypatch, memory=True)
    assert of_type(stream, "memory.retrieved")[0]["data"]["entries"]


def test_parse_critique_handles_think_block_and_clamps():
    text = '<think>{"not": "this"}</think>\nResult: {"findings": [], "quality_score": 140}'
    assert loop.parse_critique(text)["quality_score"] == 100


def test_bad_critic_twice_scores_quality_zero():
    class Broken:
        calls = 0

        def complete(self, role, system, user):
            Broken.calls += 1
            return "not json"

    class Result:
        scores = [0, 0, 0, 0]
        failed_tests = []

    assert loop.critique_code(Broken(), "spec", "code", Result())["quality_score"] == 0
    assert Broken.calls == 2


class Panel:
    reviewers = ["kimi", "glm"]

    def __init__(self, reply):
        self.reply = reply
        self.prompts = []
        self.turns = []

    def review(self, turn, system, user):
        self.turns.append(turn)
        self.prompts.append(system + user)
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def version():
    return loop.Version("V1", "code", [50, 50, 50, 50], 5000, {"findings": []}, "n1", ["test_a"])


def test_reviewer_findings_are_parsed_and_stay_anonymous():
    llm = Panel('<think>hmm</think>{"findings":[{"severity":"high","issue":"x","suggested_fix":"y"}],"quality_score":99}')
    assert loop.review_code(llm, "spec", version(), 1) == [{"severity": "high", "issue": "x", "suggested_fix": "y"}]
    assert llm.turns == [1]
    assert not any(name in llm.prompts[0].lower() for name in ("kimi", "glm", "deepseek", "qwen"))


def test_a_failed_reviewer_never_stops_the_run():
    assert loop.review_code(Panel("not json"), "spec", version(), 0) == []
    assert loop.review_code(Panel(httpx.ConnectError("down")), "spec", version(), 0) == []


def test_no_reviewers_means_the_original_loop():
    class Single:
        pass

    assert loop.review_code(Single(), "spec", version(), 0) == []


def test_a_reviewer_cannot_change_the_score():
    """Only the fixed critic may score, or a total could rise because the grader changed."""
    assert "quality_score" not in loop.REVIEW_SYSTEM


@pytest.mark.parametrize(
    "text", ["```python\nx = 1\n```", "Sure:\n```\nx = 1\n```\nDone", "x = 1\n"]
)
def test_extract_code(text):
    assert loop.extract_code(text).strip() == "x = 1"


def test_seed_memory_uses_only_real_run_entries(tmp_path, monkeypatch):
    run_offline(tmp_path, monkeypatch, "regression")
    monkeypatch.setattr(memory_module, "BAKED_MEMORY", tmp_path / "seed.json")
    seeded = memory_module.seed_from_run(tmp_path / "run")
    assert sorted(item["kind"] for item in seeded) == ["improvement", "regression"]
    assert all(item["summary"].startswith("lru-cache: ") for item in seeded)


def test_clean_bullets_strips_model_noise():
    text = "!!!!!!- Added a check\n\n* Moved `put`\n!!!!\n"
    assert loop.clean_bullets(text) == ["Added a check", "Moved `put`"]


def test_tie_keeps_version_and_records_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(events, "RUNS_DIR", tmp_path)
    llm = OfflineClient("lru-cache")
    # v3 sits far from an efficiency bucket edge, so the versions tie even on a busy machine.
    v1, _, v3 = list(llm.outputs)
    llm.outputs = iter([v1, v3, v3.replace("class LRUCache:", "# refactor\nclass LRUCache:")])
    sink = EventSink("run", "agentA")
    tree = loop.Tree(sink)
    best = loop.run(llm, sink, BakedSettlement(sink, tree), tree, "lru-cache", "agentA", AUTHOR, False)
    stream = [json.loads(line) for line in sink.path.read_text(encoding="utf-8").splitlines()]
    assert best.name == "V2"
    assert of_type(stream, "regression.recorded") == []
