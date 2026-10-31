import asyncio
import json

import httpx
from fastapi.testclient import TestClient

from bridge.app import create_app
from bridge.hub import EventHub, sse_frame
from bridge.store import EntryStore, canonical_bytes, valid_cid

ENTRY = {"schema": "autoevolve.memory.v1", "kind": "improvement"}


def offline_client(tmp_path):
    return TestClient(create_app(offline=True, store=EntryStore(tmp_path)))


def pinata(handler, tmp_path):
    return EntryStore(tmp_path, jwt="jwt", transport=httpx.MockTransport(handler))


def test_offline_health_reports_offline(tmp_path):
    assert offline_client(tmp_path).get("/health").json()["offline"] is True


def test_offline_pin_then_fetch_round_trip(tmp_path):
    client = offline_client(tmp_path)
    reply = client.post("/pin", json=ENTRY).json()
    assert reply["baked"] is True and reply["cid"].startswith("baked-")
    assert client.get(f"/entry/{reply['cid']}").json() == ENTRY


def test_pin_rejects_entry_id_in_blob(tmp_path):
    assert offline_client(tmp_path).post("/pin", json={**ENTRY, "entry_id": "0x1"}).status_code == 422


def test_entry_rejects_path_traversal_style_cids(tmp_path):
    assert not valid_cid("../../.env")
    assert not valid_cid("..%2f..%2f.env")
    assert offline_client(tmp_path).get("/entry/bad.cid.name").status_code == 400


def test_offline_submit_is_labelled_baked(tmp_path):
    reply = offline_client(tmp_path).post("/submit", json={"entry_id": "0x1"}).json()
    assert reply["baked"] is True and reply["tx"].startswith("baked-tx-")


def test_online_submit_refuses_instead_of_faking(tmp_path):
    client = TestClient(create_app(offline=False, store=EntryStore(tmp_path)))
    assert client.post("/submit", json={}).status_code == 503


def test_memory_respects_k(tmp_path):
    assert len(offline_client(tmp_path).get("/memory", params={"task": "ttl-cache", "k": 1}).json()) == 1


def test_pin_sends_canonical_bytes_and_caches_them(tmp_path):
    seen = {}

    def handler(request):
        seen["body"] = request.read()
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, json={"data": {"cid": "bafyexamplecid"}})

    store = pinata(handler, tmp_path)
    assert store.pin({"b": 1, "a": 2}) == "bafyexamplecid"
    assert canonical_bytes({"a": 2, "b": 1}) in seen["body"]
    assert seen["auth"] == "Bearer jwt"
    assert store.fetch("bafyexamplecid") == {"a": 2, "b": 1}


def test_fetch_uses_gateway_once_then_cache(tmp_path):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json=ENTRY)

    store = pinata(handler, tmp_path)
    assert store.fetch("bafyexamplecid") == ENTRY
    assert store.fetch("bafyexamplecid") == ENTRY
    assert calls == ["https://gateway.pinata.cloud/ipfs/bafyexamplecid"]


def test_pinata_failure_does_not_leak_the_jwt(tmp_path, monkeypatch):
    monkeypatch.setenv("PINATA_JWT", "secret-jwt")
    store = EntryStore(
        tmp_path, jwt="secret-jwt", transport=httpx.MockTransport(lambda request: httpx.Response(401))
    )
    reply = TestClient(create_app(offline=False, store=store)).post("/pin", json=ENTRY)
    assert reply.status_code == 502
    assert "secret-jwt" not in reply.text


def test_hub_replays_history_to_late_joiners():
    async def scenario():
        hub = EventHub()
        hub.publish({"type": "run.started"})
        queue = hub.subscribe()
        hub.publish({"type": "run.finished"})
        return [(await queue.get())["type"], (await queue.get())["type"]]

    assert asyncio.run(scenario()) == ["run.started", "run.finished"]


def test_posted_event_reaches_the_hub(tmp_path):
    client = offline_client(tmp_path)
    assert client.post("/events", json={"type": "run.started"}).json() == {"ok": True}
    assert client.app.state.hub.history[0] == {"type": "run.started"}


def test_sse_frame_format():
    frame = sse_frame({"type": "x"})
    assert frame.startswith("data: ") and frame.endswith("\n\n")
    assert json.loads(frame[6:]) == {"type": "x"}


def test_online_pin_returns_a_gateway_link(tmp_path, monkeypatch):
    monkeypatch.setenv("PINATA_JWT", "jwt")
    store = pinata(lambda request: httpx.Response(200, json={"data": {"cid": "bafyexamplecid"}}), tmp_path)
    reply = TestClient(create_app(offline=False, store=store)).post("/pin", json=ENTRY).json()
    assert reply["gateway_url"] == "https://gateway.pinata.cloud/ipfs/bafyexamplecid"
