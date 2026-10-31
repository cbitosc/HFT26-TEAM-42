import json
from pathlib import Path

import jsonschema
from eth_hash.auto import keccak

from agent import entry as entries

SCHEMA = json.loads(
    (Path(__file__).parents[2] / "shared" / "memory_entry.schema.json").read_text(encoding="utf-8")
)
AUTHOR = "0x" + "ab" * 20
H_OLD = "0x" + "11" * 32
H_NEW = "0x" + "22" * 32


def make_entry():
    return entries.build_entry(
        agent_id="agentA",
        author=AUTHOR,
        task_signature="lru-cache",
        kind="improvement",
        from_version="V1",
        to_version="V2",
        hypothesis="h",
        failure_pattern="f",
        changelog=["c"],
        diff="d",
        critique={"model": "m", "findings": []},
        scores_old=[70, 40, 60, 55],
        scores_new=[92, 75, 60, 70],
        system_prompt="secret prompt",
        models={"generator": "g", "critic": "c"},
        test_suite_hash="0x00",
    )


def test_keccak_is_ethereum_keccak_not_sha3():
    assert keccak(b"").hex().startswith("c5d2460186f7233c")


def test_entry_id_packs_like_solidity_encode_packed():
    packed = (
        b"bafyexample"
        + bytes.fromhex("11" * 32)
        + bytes.fromhex("22" * 32)
        + keccak(b"lru-cache")
        + bytes.fromhex("ab" * 20)
    )
    assert len(packed) == 11 + 32 + 32 + 32 + 20
    derived = entries.derive_entry_id("bafyexample", H_OLD, H_NEW, "lru-cache", AUTHOR)
    assert derived == "0x" + keccak(packed).hex()


def test_negative_id_differs_from_improvement_id():
    negative = entries.derive_negative_entry_id("cid", "lru-cache", AUTHOR)
    assert negative != entries.derive_entry_id("cid", H_OLD, H_NEW, "lru-cache", AUTHOR)


def test_entry_matches_schema_and_has_no_entry_id():
    entry = make_entry()
    jsonschema.validate(entry, SCHEMA)
    assert "entry_id" not in entry


def test_system_prompt_is_never_in_the_entry():
    assert "secret prompt" not in json.dumps(make_entry())


def test_canonical_json_ignores_key_order():
    assert entries.canonical_json({"b": 1, "a": 2}) == entries.canonical_json({"a": 2, "b": 1})
