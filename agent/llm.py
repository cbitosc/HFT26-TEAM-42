import hashlib
import logging
import os
import time
from pathlib import Path

import httpx

log = logging.getLogger("agent.llm")

FEATHERLESS_URL = "https://api.featherless.ai/v1/chat/completions"
MAX_RETRIES = 2
TIMEOUT_S = 300
# R1 spends its budget on reasoning first; the 4096 default leaves its answer empty.
MAX_TOKENS = {"generator": 2000, "critic": 12000, "changelog": 400, "reviewer": 6000}
FIXTURES = Path(__file__).parent / "fixtures"


def _sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class FeatherlessClient:
    def __init__(self):
        self.api_key = os.environ["FEATHERLESS_API_KEY"]
        self.models = {
            "generator": os.environ.get("GENERATOR_MODEL", "Qwen/Qwen2.5-Coder-32B-Instruct"),
            "critic": os.environ.get("CRITIC_MODEL", "deepseek-ai/DeepSeek-R1-0528"),
        }
        self.models["changelog"] = self.models["generator"]
        self.reviewers = [model.strip() for model in os.environ.get("REVIEW_MODELS", "").split(",") if model.strip()]

    def complete(self, role, system, user):
        return self._send(self.models[role], role, system, user)

    def review(self, turn, system, user):
        return self._send(self.reviewers[turn % len(self.reviewers)], "reviewer", system, user)

    def _send(self, model, role, system, user):
        body = {
            "model": model,
            "temperature": 0,
            "max_tokens": MAX_TOKENS[role],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = httpx.post(
                    FEATHERLESS_URL,
                    json=body,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=TIMEOUT_S,
                )
                response.raise_for_status()
                text = response.json()["choices"][0]["message"]["content"]
                log.info("%s prompt=%s response=%s", model, _sha(system + user), _sha(text))
                return text
            except (httpx.HTTPError, KeyError, IndexError):
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(2**attempt)


class OfflineClient:
    """Replays fixture outputs. `regression` makes V2 worse so that path can be exercised."""

    models = {"generator": "offline-fixture", "critic": "offline-fixture", "changelog": "offline-fixture"}
    reviewers = []

    def __init__(self, signature, scenario="clean"):
        stem = signature.replace("-", "_")
        outputs = [(FIXTURES / f"{stem}_{v}.py").read_text(encoding="utf-8") for v in ("v1", "v2", "v3")]
        if scenario == "regression":
            outputs[1] = "class LRUCache:\n    pass\n"
        self.outputs = iter(f"```python\n{code}```" for code in outputs)

    def complete(self, role, system, user):
        if role == "generator":
            return next(self.outputs)
        if role == "critic":
            return (
                '{"findings":[{"severity":"high","issue":"Edge cases mishandled",'
                '"suggested_fix":"Separate missing keys from None values"}],"quality_score":70}'
            )
        return "- Handle edge cases found by the critic\n- Keep reads and writes fast at large capacity"
