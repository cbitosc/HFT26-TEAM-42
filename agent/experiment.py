"""A/B test of inherited memory: Agent B's V1 on a sibling task, with and without it."""
import json
import statistics
from collections import Counter
from pathlib import Path

from agent import embed, harness, loop, memory
from agent import entry as entries
from agent.events import RUNS_DIR, EventSink
from agent.settlement import BakedSettlement

STUB_AUTHOR = "0x" + "00" * 20
BAKED =Path(__file__).parent.parent / "shared" / "baked"
OUTPUT = BAKED / "experiment.json"
CODE_DIR = BAKED / "experiment_code"


def score_v1(llm, spec, prompt, signature):
    code = loop.extract_code(llm.complete("generator", loop.SYSTEM_PROMPT, prompt))
    result = harness.score(code, signature)
    quality = loop.critique_code(llm, spec, code, result)["quality_score"]
    return result.scores[:3] + [quality], result.failed_tests, code


def run_arm(llm, spec, prompt, signature, trials, label):
    outcomes = [score_v1(llm, spec, prompt, signature) for _ in range(trials)]
    CODE_DIR.mkdir(exist_ok=True)
    for number, (_, _, code) in enumerate(outcomes, start=1):
        (CODE_DIR / f"{label}-{number}.py").write_text(code, encoding="utf-8")
    result = arm([vector for vector, _, _ in outcomes])
    result["test_failures"] = dict(Counter(name for _, failed, _ in outcomes for name in failed))
    return result


def arm(vectors):
    totals = [harness.total_score(vector) for vector in vectors]
    return {
        "vectors": vectors,
        "totals": totals,
        "mean_vector": [round(statistics.mean(axis)) for axis in zip(*vectors)],
        "mean_total": round(statistics.mean(totals)),
    }


def median_pair(off, on):
    """The median delta, not the best one, so the headline number isn't cherry-picked."""
    deltas = sorted(
        (b - a, index) for index, (a, b) in enumerate(zip(off["totals"], on["totals"]))
    )
    delta, index = deltas[len(deltas) // 2]
    return {
        "trial": index + 1,
        "off": off["vectors"][index],
        "on": on["vectors"][index],
        "off_total": off["totals"][index],
        "on_total": on["totals"][index],
        "delta": delta,
        "tx": None,
        "block": None,
    }


def run(llm, signature, inherited, trials):
    task_dir, _ = harness.load_task(signature)
    spec = (task_dir / "spec.md").read_text(encoding="utf-8")
    with_memory = spec + memory.prompt_block(inherited)
    off = run_arm(llm, spec, spec, signature, trials, "off")
    on = run_arm(llm, spec, with_memory, signature, trials, "on")
    return {
        "task_signature": signature,
        "trials": trials,
        "off": off,
        "on": on,
        "proven": median_pair(off, on),
        "inherited": [item["entry_id"] for item in inherited],
        "confidence": [],
    }


def run_loop_once(llm, signature, run_id):
    sink = EventSink(run_id, "agentA")
    tree = loop.Tree(sink)
    best = loop.run(llm, sink, BakedSettlement(sink, tree), tree, signature, "agentA", STUB_AUTHOR, False)
    events = [json.loads(line) for line in sink.path.read_text(encoding="utf-8").splitlines()]
    finished = next(event["data"] for event in events if event["type"] == "run.finished")
    return {
        "scores": best.scores,
        "total": best.total,
        "by_version": finished["scores_by_version"],
        "gain": finished["total_gain"],
        "regressions": sum(event["type"] == "regression.recorded" for event in events),
    }


def compare_reviewers(llm, signature, trials, output, stamp):
    """Same loop with and without rotating reviewers. Arms alternate so provider drift hits both."""
    panel = list(llm.reviewers)
    result = {"task_signature": signature, "reviewers": panel, "control": [], "panel": [], "errors": []}
    for trial in range(1, trials + 1):
        for name, reviewers in (("control", []), ("panel", panel)):
            llm.reviewers = reviewers
            try:
                result[name].append(run_loop_once(llm, signature, f"review-{stamp}-{signature}-{name}-{trial}"))
            except Exception as error:  # A lost trial is reported, and must not lose the others.
                result["errors"].append({"arm": name, "trial": trial, "error": type(error).__name__})
            output.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    return result


def attest(result, settlement, author):
    """Proves the reported median pair on-chain, so the headline points at a real transaction."""
    pair = result["proven"]
    signature = result["task_signature"]
    note = (
        f"Median of {result['trials']} paired trials: V1 scored {pair['off_total']} "
        f"without memory, {pair['on_total']} with it"
    )
    entry = entries.build_entry(
        agent_id="agentB",
        author=author,
        task_signature=signature,
        kind="improvement",
        from_version="V1-without-memory",
        to_version="V1-with-memory",
        hypothesis=note,
        failure_pattern="Edge cases missed when starting without inherited memory",
        changelog=[note],
        diff="",
        critique={"model": "none", "findings": []},
        scores_old=pair["off"],
        scores_new=pair["on"],
        system_prompt=loop.SYSTEM_PROMPT,
        models={"generator": "see experiment_code", "critic": "see experiment_code"},
        test_suite_hash=harness.test_suite_hash(signature),
        embedding=embed.embed(note),
    )
    entry_id = settlement.settle_improvement(entry, None)
    return {**result, "proven": {**pair, "tx": settlement.last_tx["tx"], "block": settlement.last_tx["block"], "entry_id": entry_id}}
