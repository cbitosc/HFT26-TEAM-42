import json
import time
from pathlib import Path

import httpx

RUNS_DIR = Path("runs")
POST_TIMEOUT_S = 2


class EventSink:
    def __init__(self, run_id, agent_id, bridge_url=None, token=None):
        self.run_id = run_id
        self.agent_id = agent_id
        self.bridge_url = bridge_url
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}
        self.path = RUNS_DIR / run_id / "events.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def emit(self, event_type, data):
        event = {
            "ts": int(time.time() * 1000),
            "run_id": self.run_id,
            "agent_id": self.agent_id,
            "type": event_type,
            "data": data,
        }
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event) + "\n")
        if self.bridge_url:
            try:
                httpx.post(f"{self.bridge_url}/events", json=event, headers=self.headers, timeout=POST_TIMEOUT_S)
            except httpx.HTTPError:
                self.bridge_url = None
