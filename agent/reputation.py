"""Critique reputation: how revisions went after each reviewer advised, against no reviewer at all."""
import json
import statistics
from pathlib import Path

OUTPUT = Path(__file__).parent.parent / "shared" / "baked" / "reviewer_reputation.json"


def rounds(run):
    """Yields (turn, gain) for each revision, where gain is measured against the best version so far."""
    versions = sorted(run["by_version"], key=lambda name: int(name[1:]))
    best = run["by_version"][versions[0]]
    for turn, name in enumerate(versions[1:]):
        total = run["by_version"][name]
        yield turn, total - best
        best = max(best, total)


def summary(gains):
    return {
        "rounds": len(gains),
        "improved": sum(gain > 0 for gain in gains),
        "mean_gain": round(statistics.mean(gains)) if gains else None,
    }


def score(results):
    """A reviewer is compared with single-critic rounds at the same turn, because V2 gains more easily than V3."""
    advised, baseline = {}, {}
    for result in results:
        panel = result["reviewers"]
        for run in result["panel"]:
            for turn, gain in rounds(run):
                advised.setdefault((panel[turn % len(panel)], turn), []).append(gain)
        for run in result["control"]:
            for turn, gain in rounds(run):
                baseline.setdefault(turn, []).append(gain)
    table = []
    for (reviewer, turn), gains in sorted(advised.items()):
        row = {"reviewer": reviewer, "turn": turn, **summary(gains), "baseline": summary(baseline.get(turn, []))}
        known = row["baseline"]["mean_gain"]
        row["lift"] = None if known is None else row["mean_gain"] - known
        table.append(row)
    return table


def load(paths):
    return [json.loads(path.read_text(encoding="utf-8")) for path in paths]
