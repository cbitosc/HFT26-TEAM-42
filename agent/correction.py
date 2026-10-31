"""Self-correcting memory: blames a lesson only when a controlled run ties it to a specific test."""
import json
from collections import Counter
from pathlib import Path

from agent import embed, harness, loop, memory
from agent import entry as entries

MIN_TRIALS = 3
CAUSED_RATE = 2 / 3
BACKGROUND_RATE = 1 / 3
OUTPUT = Path(__file__).parent.parent / "shared" / "baked" / "correction.json"
PLANTED_NOTE = "Planted on purpose to test self-correction. The score gain is real, this explanation of it is not."
PLANTED_TEXT = "every successful get must restart the item's ttl, so items that are read stay alive"

PLANTED_TTL = {
    "entry_id": "planted-ttl-read-resets-expiry",
    "kind": "improvement",
    "tier": "Candidate",
    "summary": f"ttl-cache: {PLANTED_TEXT}",
    "test": "test_read_does_not_extend_life",
}


def verdict(without, with_lesson, trials):
    """Deterministic on purpose: a reader can recompute it from the two failure counts."""
    if trials < MIN_TRIALS:
        return "inconclusive"
    if with_lesson / trials >= CAUSED_RATE and without / trials <= BACKGROUND_RATE:
        return "contradicted"
    if with_lesson == 0 and without == 0:
        return "not_contradicted"
    return "inconclusive"


def trial(llm, signature, prompt):
    code = loop.extract_code(llm.complete("generator", loop.SYSTEM_PROMPT, prompt))
    return harness.score(code, signature).failed_tests


def probe(llm, signature, lesson, trials, output=None):
    task_dir, _ = harness.load_task(signature)
    spec = (task_dir / "spec.md").read_text(encoding="utf-8")
    prompts = {"without": spec, "with": spec + memory.prompt_block([lesson])}
    failures = {"without": [], "with": []}
    for _ in range(trials):
        for arm, prompt in prompts.items():  # Alternating keeps provider drift out of the comparison.
            failures[arm].append(trial(llm, signature, prompt))
    counts = {arm: sum(lesson["test"] in failed for failed in runs) for arm, runs in failures.items()}
    result = {
        "task_signature": signature,
        "entry_id": lesson["entry_id"],
        "lesson": lesson["summary"],
        "test": lesson["test"],
        "trials": trials,
        "failed_without": counts["without"],
        "failed_with": counts["with"],
        "other_failures": {arm: dict(Counter(name for failed in runs for name in failed)) for arm, runs in failures.items()},
        "verdict": verdict(counts["without"], counts["with"], trials),
    }
    if output:
        output.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    return result


def plant(settlement, author, scores_old, scores_new):
    """Publishes a wrong explanation for a real, proven gain, and labels it in the pinned blob."""
    signature = "ttl-cache"
    entry = entries.build_entry(
        agent_id="agentA",
        author=author,
        task_signature=signature,
        kind="improvement",
        from_version="V1",
        to_version="V2",
        hypothesis=PLANTED_TEXT,
        failure_pattern=PLANTED_NOTE,
        changelog=[PLANTED_TEXT],
        diff="",
        critique={"model": "none", "findings": []},
        scores_old=scores_old,
        scores_new=scores_new,
        system_prompt=loop.SYSTEM_PROMPT,
        models={"generator": "planted", "critic": "planted"},
        test_suite_hash=harness.test_suite_hash(signature),
        embedding=embed.embed(PLANTED_TEXT),
    )
    entry["planted"] = True
    return settlement.settle_improvement(entry, None)


def challenge(llm, settlement, entry_id, reporter_entry_id, trials):
    """Runs the controlled test on a lesson read from the chain, then posts only what the test found."""
    signature = "ttl-cache"
    read = lambda include: memory.retrieve_chain(
        signature, settlement.rpc_url, settlement.registry, settlement._get, include_disputed=include
    )
    target = next(item for item in read(True) if item["entry_id"] == entry_id)
    result = probe(llm, signature, {**target, "test": PLANTED_TTL["test"]}, trials)
    result["evidence"] = None
    if result["verdict"] == "contradicted":
        reply = settlement.send_evidence(entry_id, False, reporter_entry_id)
        if reply.get("status") == "rejected":
            raise RuntimeError(f"Evidence rejected: {reply['reason']}")
        result["evidence"] = {"tx": reply["tx"], "block": reply["block"]}

    after = [item for item in read(True) if item["entry_id"] == entry_id][0]
    inherited = read(False)
    result["disputed"] = after["disputed"]
    result["confidence_after"] = after["confidence"]
    result["still_recommended"] = any(item["entry_id"] == entry_id for item in inherited)

    task_dir, _ = harness.load_task(signature)
    spec = (task_dir / "spec.md").read_text(encoding="utf-8")
    prompt = spec + memory.prompt_block(inherited)
    healed = [trial(llm, signature, prompt) for _ in range(trials)]
    result["failed_after_correction"] = sum(PLANTED_TTL["test"] in failed for failed in healed)
    OUTPUT.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    return result
