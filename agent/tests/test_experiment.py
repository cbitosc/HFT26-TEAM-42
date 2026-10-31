from pathlib import Path

import pytest

from agent import embed, experiment, memory

CORRECT = (Path(__file__).parent.parent / "fixtures" / "ttl_cache_correct.py").read_text(encoding="utf-8")
BROKEN = "class TTLCache:\n    pass\n"
LESSON = {"entry_id": "0x1", "kind": "improvement", "tier": "Candidate", "summary": "reject bad capacity"}


class FakeLLM:
    def __init__(self):
        self.prompts = []

    def complete(self, role, system, user):
        if role == "critic":
            return '{"findings": [], "quality_score": 50}'
        self.prompts.append(user)
        code = CORRECT if "reject bad capacity" in user else BROKEN
        return f"```python\n{code}```"


@pytest.fixture(autouse=True)
def code_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(experiment, "CODE_DIR", tmp_path)
    return tmp_path


def test_each_solution_and_its_failures_are_recorded(code_dir):
    result = experiment.run(FakeLLM(), "ttl-cache", [LESSON], trials=2)
    assert sorted(path.name for path in code_dir.glob("*.py")) == ["off-1.py", "off-2.py", "on-1.py", "on-2.py"]
    assert result["off"]["test_failures"]["test_put_then_get"] == 2
    assert result["on"]["test_failures"] == {}


def test_memory_reaches_only_the_on_arm():
    llm = FakeLLM()
    result = experiment.run(llm, "ttl-cache", [LESSON], trials=1)
    assert "reject bad capacity" not in llm.prompts[0]
    assert "reject bad capacity" in llm.prompts[1]
    assert result["on"]["mean_total"] > result["off"]["mean_total"]
    assert result["inherited"] == ["0x1"]


def test_result_is_unproven_until_a_real_tx_exists():
    result = experiment.run(FakeLLM(), "ttl-cache", [LESSON], trials=1)
    assert result["proven"]["tx"] is None and result["proven"]["block"] is None


def test_median_pair_is_not_the_best_trial():
    off = experiment.arm([[0, 0, 0, 0]] * 3)
    on = experiment.arm([[10, 0, 0, 0], [50, 0, 0, 0], [100, 0, 0, 0]])
    pair = experiment.median_pair(off, on)
    assert pair["trial"] == 2 and pair["delta"] == 2000


def test_seed_entries_never_reach_a_prompt():
    common = {"task_signature": "lru-cache", "kind": "improvement", "to_version": "V2", "created_at": 1}
    seed = {**common, "changelog": ["hand written"], "seed": True}
    real = {**common, "changelog": ["learned"], "failure_pattern": "x"}
    ranked = [
        {"entry_id": "0x1", "cid": "a", "tier": "Trusted", "confidence": 1.0, "entry": seed},
        {"entry_id": "0x2", "cid": "b", "tier": "Candidate", "confidence": 0.5, "entry": real},
    ]
    kept = memory.retrieve_bridge("ttl-cache", lambda path: ranked)
    assert [item["entry_id"] for item in kept] == ["0x2"]


def test_missing_embedding_model_is_not_fatal(monkeypatch):
    monkeypatch.setattr(embed.importlib.util, "find_spec", lambda name: None)
    assert embed.embed("text") is None


def test_cli_parses_every_command():
    from agent import cli

    assert cli.parse_args(["experiment"]).task == "ttl-cache"
    assert cli.parse_args(["run", "--task", "lru-cache", "--agent", "A", "--no-chain"]).no_chain
    assert cli.parse_args(["seed-memory", "--run-id", "x"]).run_id == "x"


def test_attest_records_the_real_transaction_for_the_reported_pair():
    class FakeSettlement:
        last_tx = {"tx": "0xabc", "block": 7}

        def settle_improvement(self, entry, parent_id):
            self.entry = entry
            return "0xentry"

    result = experiment.run(FakeLLM(), "ttl-cache", [LESSON], trials=1)
    settlement = FakeSettlement()
    attested = experiment.attest(result, settlement, "0x" + "ab" * 20)
    assert attested["proven"]["tx"] == "0xabc" and attested["proven"]["block"] == 7
    assert settlement.entry["scores"] == {"old": result["proven"]["off"], "new": result["proven"]["on"]}
    assert "entry_id" not in settlement.entry


def test_attestation_entries_are_not_lessons():
    assert memory.is_lesson({"to_version": "V3"})
    assert not memory.is_lesson({"to_version": "V1-with-memory"})
    assert not memory.is_lesson({"to_version": "B-on"})
    assert not memory.is_lesson({"to_version": "V2", "seed": True})


def item(number, kind="improvement", tier="Candidate", confidence=0.5):
    return {"entry_id": number, "kind": kind, "tier": tier, "confidence": confidence, "created_at": number}


def test_negative_memory_survives_a_full_top_k():
    found = [item(n, tier="Validated", confidence=1.0) for n in range(12)] + [item(99, "regression")]
    chosen = memory.select(found)
    assert len(chosen) == memory.TOP_K
    assert chosen[0]["kind"] == "regression"


def test_recency_breaks_ties():
    chosen = memory.select([item(n) for n in range(12)])
    assert [entry["entry_id"] for entry in chosen] == [11, 10, 9, 8, 7, 6, 5, 4]
