"""Scores candidate code into the integer vector from docs/02-INTERFACES.md.

Not a security boundary: the subprocess has no secrets in its env and sockets are
blocked in Python, but it can still read files on disk. Run real LLM output with no
secrets on the filesystem, or in a container, for anything beyond a local demo.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

AGENT_DIR = Path(__file__).parent
TASKS_DIR = AGENT_DIR / "tasks"
RUNNER = AGENT_DIR / "sandbox_runner.py"
WEIGHTS = (40, 30, 15, 15)
TEST_TIMEOUT_S = 10
BENCH_TIMEOUT_S = 30
MAX_RESULT_BYTES = 64_000
ENV_ALLOWLIST = ("SYSTEMROOT", "WINDIR", "TEMP", "TMP")


@dataclass
class HarnessResult:
    scores: list
    total: int
    failed_tests: list = field(default_factory=list)


def total_score(scores):
    return sum(w * s for w, s in zip(WEIGHTS, scores))


def load_task(signature):
    task_dir = TASKS_DIR / signature.replace("-", "_")
    return task_dir, json.loads((task_dir / "task.json").read_text(encoding="utf-8"))


def test_suite_hash(signature):
    task_dir, _ = load_task(signature)
    digest = hashlib.sha256()
    for path in sorted(task_dir.glob("*")):
        if path.is_file():
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    return "0x" + digest.hexdigest()


def _sandbox_env():
    return {k: os.environ[k] for k in ENV_ALLOWLIST if k in os.environ}


def _run(mode, suite_path, candidate_path, workdir, timeout):
    command = [sys.executable, "-I", str(RUNNER), mode, str(suite_path), str(candidate_path)]
    try:
        proc = subprocess.run(
            command, cwd=workdir, env=_sandbox_env(), capture_output=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        return None
    if proc.returncode != 0 or len(proc.stdout) > MAX_RESULT_BYTES:
        return None
    try:
        return json.loads(proc.stdout)
    except ValueError:
        return None


def _percent(result):
    if not result or not result["total"]:
        return 0
    return round(100 * result["passed"] / result["total"])


def _efficiency(ratio_result, curve):
    if not ratio_result:
        return 0
    for limit, points in curve["steps"]:
        if ratio_result["ratio"] <= limit:
            return points
    return curve["floor"]


def score(code, signature, quality=0):
    task_dir, task = load_task(signature)
    with tempfile.TemporaryDirectory(prefix="autoevolve-") as workdir:
        candidate = Path(workdir) / "candidate.py"
        candidate.write_text(code, encoding="utf-8")
        visible = _run("tests", task_dir / "visible_tests.py", candidate, workdir, TEST_TIMEOUT_S)
        edge = _run("tests", task_dir / "edge_tests.py", candidate, workdir, TEST_TIMEOUT_S)
        bench = _run("bench", task_dir / "benchmark.py", candidate, workdir, BENCH_TIMEOUT_S)

    scores = [_percent(visible), _percent(edge), _efficiency(bench, task["efficiency_curve"]), quality]
    failed = (visible or {}).get("failed", ["visible suite crashed"]) + (edge or {}).get(
        "failed", ["edge suite crashed"]
    )
    return HarnessResult(scores=scores, total=total_score(scores), failed_tests=failed)
