import hashlib
import json
import time

from eth_hash.auto import keccak

from agent import zk

SCHEMA = "autoevolve.memory.v1"
WEIGHTS_VERSION = "w-40-30-15-15"


def keccak_hex(data):
    return "0x" + keccak(data).hex()


def task_hash(signature):
    return keccak_hex(signature.encode("utf-8"))


def placeholder_score_hash(scores):
    """Only used where ezkl is not installed. Entries using it set placeholder: true."""
    return keccak_hex(json.dumps(scores).encode("utf-8"))


def canonical_json(entry):
    return json.dumps(entry, sort_keys=True, separators=(",", ":"))


def _bytes(hex_value):
    return bytes.fromhex(hex_value.removeprefix("0x"))


def derive_entry_id(cid, score_hash_old, score_hash_new, task_signature, author):
    packed = (
        cid.encode("utf-8")
        + _bytes(score_hash_old)
        + _bytes(score_hash_new)
        + _bytes(task_hash(task_signature))
        + _bytes(author)
    )
    return keccak_hex(packed)


def derive_negative_entry_id(cid, task_signature, author):
    return keccak_hex(cid.encode("utf-8") + _bytes(task_hash(task_signature)) + _bytes(author))


def build_entry(
    *,
    agent_id,
    author,
    task_signature,
    kind,
    from_version,
    to_version,
    hypothesis,
    failure_pattern,
    changelog,
    diff,
    critique,
    scores_old,
    scores_new,
    system_prompt,
    models,
    test_suite_hash,
    embedding=None,
):
    if zk.available():
        hash_old, hash_new, flags = zk.score_hash(scores_old), zk.score_hash(scores_new), {}
    else:
        hash_old = placeholder_score_hash(scores_old)
        hash_new = placeholder_score_hash(scores_new)
        flags = {"placeholder": True}
    return {
        "schema": SCHEMA,
        "agent_id": agent_id,
        "agent_address": author,
        "task_signature": task_signature,
        "kind": kind,
        "from_version": from_version,
        "to_version": to_version,
        "hypothesis": hypothesis,
        "failure_pattern": failure_pattern,
        "changelog": changelog,
        "diff": diff,
        "critique": critique,
        "scores": {"old": scores_old, "new": scores_new},
        "score_hash_old": hash_old,
        "score_hash_new": hash_new,
        **flags,
        "weights_version": WEIGHTS_VERSION,
        "system_prompt_hash": keccak_hex(system_prompt.encode("utf-8")),
        "models": {**models, "temperature": 0},
        "harness": {"image_digest": None, "test_suite_hash": test_suite_hash},
        "embedding": embedding,
        "supersedes": None,
        "parent_cid": None,
        "created_at": int(time.time()),
    }


def baked_cid(entry):
    return "baked-" + hashlib.sha256(canonical_json(entry).encode("utf-8")).hexdigest()[:32]
