import base64
import hashlib

import httpx
import pytest
from fastapi.testclient import TestClient

from bridge.app import create_app
from bridge.chain import DAY_S, confidence, related_tasks
from bridge.store import EntryStore, check_content

NOW = 1_800_000_000


def raw_cid(body):
    digest = bytes([0x01, 0x55, 0x12, 0x20]) + hashlib.sha256(body).digest()
    return "b" + base64.b32encode(digest).decode().lower().rstrip("=")


def test_confidence_is_neutral_without_evidence():
    assert confidence([], NOW) == 0.5


def test_confidence_weights_recent_evidence_higher():
    recent_support = confidence([(NOW, True), (NOW - 14 * DAY_S, False)], NOW)
    recent_contradiction = confidence([(NOW, False), (NOW - 14 * DAY_S, True)], NOW)
    assert recent_support > 0.5 > recent_contradiction


def test_confidence_decays_when_idle():
    assert confidence([(NOW - 60 * DAY_S, True)], NOW) == pytest.approx(0.9)


def test_related_tasks_include_siblings():
    assert related_tasks("ttl-cache") == ["ttl-cache", "lru-cache"]


def test_check_content_accepts_matching_bytes():
    check_content(raw_cid(b'{"a":1}'), b'{"a":1}')


def test_check_content_rejects_tampered_bytes():
    with pytest.raises(ValueError):
        check_content(raw_cid(b'{"a":1}'), b'{"a":2}')


def test_tampered_gateway_reply_is_not_cached(tmp_path):
    cid = raw_cid(b'{"a":1}')
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=b'{"a":2}'))
    with pytest.raises(ValueError):
        EntryStore(tmp_path, transport=transport).fetch(cid)
    assert not (tmp_path / f"{cid}.json").exists()


def test_memory_returns_interface_fields_for_sibling_tasks(tmp_path):
    client = TestClient(create_app(offline=True, store=EntryStore(tmp_path)))
    items = client.get("/memory", params={"task": "ttl-cache"}).json()
    assert items and all({"entry_id", "cid", "tier", "confidence", "entry"} <= set(item) for item in items)


def test_memory_filters_unrelated_tasks(tmp_path):
    client = TestClient(create_app(offline=True, store=EntryStore(tmp_path)))
    assert client.get("/memory", params={"task": "other-task"}).json() == []


def test_offline_query_param_works_per_request(tmp_path):
    client = TestClient(create_app(offline=False, store=EntryStore(tmp_path)))
    assert client.post("/submit", json={}).status_code == 503
    assert client.post("/submit?offline=1", json={}).json()["baked"] is True


def test_token_guards_writes_but_not_reads(tmp_path, monkeypatch):
    monkeypatch.setenv("BRIDGE_TOKEN", "secret")
    client = TestClient(create_app(offline=True, store=EntryStore(tmp_path)))
    assert client.post("/events", json={"type": "fake"}).status_code == 401
    assert client.post("/pin", json={}).status_code == 401
    assert client.post("/events", json={}, headers={"Authorization": "Bearer secret"}).status_code == 200
    assert client.get("/health").status_code == 200
