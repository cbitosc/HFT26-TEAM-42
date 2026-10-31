import hashlib
import json
import logging

import httpx

from agent import entry as entries
from agent import memory, zk

BAKED_REWARD_WEI = 10**15
SEPOLIA_CHAIN_ID = 11155111
SUBMIT_TIMEOUT_S = 330

log = logging.getLogger(__name__)


def _baked_tx(entry_id):
    return "baked-tx-" + hashlib.sha256(entry_id.encode("utf-8")).hexdigest()[:24]


def save_record(sink, entry_id, cid, entry):
    folder = sink.path.parent / "entries"
    folder.mkdir(exist_ok=True)
    record = {"entry_id": entry_id, "cid": cid, "entry": entry}
    (folder / f"{entry_id}.json").write_text(json.dumps(record, indent=2), encoding="utf-8")


class BakedSettlement:
    """Stands in for the prover, Pinata and Sepolia. Every output is labelled baked: true."""

    def __init__(self, sink, tree):
        self.sink = sink
        self.tree = tree

    def retrieve(self, signature):
        return memory.retrieve_baked()

    def post_evidence(self, inherited, gained):
        pass

    def settle_improvement(self, entry, parent_id):
        step = {"from": entry["from_version"], "to": entry["to_version"]}
        prove = self.tree.node(parent_id, "prove", entry["to_version"], "Prove improvement")
        self.sink.emit("proof.started", step)
        cid = entries.baked_cid(entry)
        entry_id = entries.derive_entry_id(
            cid,
            entry["score_hash_old"],
            entry["score_hash_new"],
            entry["task_signature"],
            entry["agent_address"],
        )
        self.sink.emit(
            "proof.done",
            {**step, "proof_hash": None, "proving_ms": 0, "verified_locally": False, "baked": True},
        )
        self.tree.done(prove)
        save_record(self.sink, entry_id, cid, entry)
        self._record(entry_id, cid, prove, entry["to_version"])
        self.sink.emit(
            "chain.verified",
            {"entry_id": entry_id, "verifier_ok": True, "reward_wei": BAKED_REWARD_WEI, "tier": "Candidate", "baked": True},
        )
        return entry_id

    def settle_regression(self, entry, parent_id, reason):
        cid = entries.baked_cid(entry)
        entry_id = entries.derive_negative_entry_id(cid, entry["task_signature"], entry["agent_address"])
        save_record(self.sink, entry_id, cid, entry)
        self._record(entry_id, cid, parent_id, entry["to_version"])
        self.sink.emit(
            "regression.recorded",
            {"from": entry["from_version"], "to": entry["to_version"], "reason": reason, "entry_id": entry_id},
        )
        return entry_id

    def _record(self, entry_id, cid, parent_id, version):
        pin = self.tree.node(parent_id, "pin", version, "Pin memory entry")
        self.sink.emit("ipfs.pinned", {"entry_id": entry_id, "cid": cid, "gateway_url": None, "baked": True})
        self.tree.done(pin)
        submit = self.tree.node(pin, "submit", version, "Submit on-chain")
        tx = _baked_tx(entry_id)
        common = {"entry_id": entry_id, "tx": tx, "etherscan_url": None, "baked": True}
        self.sink.emit("chain.tx", {**common, "status": "pending"})
        self.sink.emit("chain.tx", {**common, "status": "confirmed", "block": 0})
        self.tree.done(submit)


class ChainSettlement:
    """Proves locally, pins and submits through the bridge. Nothing here is baked."""

    def __init__(self, sink, tree, bridge_url, agent_id, token=None, rpc_url=None, registry=None):
        self.sink = sink
        self.tree = tree
        self.bridge_url = bridge_url
        self.agent_id = agent_id
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}
        self.rpc_url = rpc_url
        self.registry = registry
        self.reporter_entry_id = None
        self.chain_id = self._get("/health")["chainId"]

    def _get(self, path):
        response = httpx.get(f"{self.bridge_url}{path}", timeout=60)
        response.raise_for_status()
        return response.json()

    def _post(self, path, body):
        response = httpx.post(f"{self.bridge_url}{path}", json=body, headers=self.headers, timeout=SUBMIT_TIMEOUT_S)
        response.raise_for_status()
        return response.json()

    def retrieve(self, signature):
        if self.agent_id == "agentB" and self.rpc_url and self.registry:
            return memory.retrieve_chain(signature, self.rpc_url, self.registry, self._get)
        return memory.retrieve_bridge(signature, self._get)

    def post_evidence(self, inherited, gained):
        """A run that gained supports what it reused. A run that didn't proves nothing about any one lesson,
        so contradictions only come from a controlled run in agent/correction.py."""
        if self.reporter_entry_id is None:
            log.info("No verified entry this run, so no evidence to post")
            return
        if not gained:
            log.info("No gain this run, which contradicts no specific lesson")
            return
        for item in inherited:
            reply = self.send_evidence(item["entry_id"], True, self.reporter_entry_id)
            if reply.get("status") == "rejected":
                log.warning("Evidence for %s rejected: %s", item["entry_id"], reply["reason"])

    def send_evidence(self, entry_id, supported, reporter_entry_id):
        return self._post(
            "/evidence",
            {
                "agent_id": self.agent_id,
                "reused_entry_id": entry_id,
                "supported": supported,
                "reporter_entry_id": reporter_entry_id,
            },
        )

    def _etherscan(self, tx):
        return f"https://sepolia.etherscan.io/tx/{tx}" if self.chain_id == SEPOLIA_CHAIN_ID else None

    def _pin(self, entry, parent_id):
        pin = self.tree.node(parent_id, "pin", entry["to_version"], "Pin memory entry")
        reply = self._post("/pin", entry)
        cid = reply["cid"]
        self.gateway_url = reply.get("gateway_url")
        self.tree.done(pin)
        return cid, pin

    def _emit_tx(self, entry_id, reply):
        common = {"entry_id": entry_id, "tx": reply.get("tx"), "etherscan_url": self._etherscan(reply.get("tx"))}
        if reply.get("status") == "rejected":
            self.sink.emit("chain.tx", {**common, "status": "reverted", "reason": reply["reason"]})
            raise RuntimeError(f"Chain rejected {entry_id}: {reply['reason']}")
        self.last_tx = reply
        self.sink.emit("chain.tx", {**common, "status": "confirmed", "block": reply["block"]})

    def settle_improvement(self, entry, parent_id):
        if entry.get("placeholder"):
            raise RuntimeError("Cannot submit placeholder score hashes. Install ezkl for zk/hash.py")
        step = {"from": entry["from_version"], "to": entry["to_version"]}
        node = self.tree.node(parent_id, "prove", entry["to_version"], "Prove improvement")
        self.sink.emit("proof.started", step)
        proof = zk.prove(entry["scores"]["old"], entry["scores"]["new"])
        self.sink.emit(
            "proof.done",
            {
                **step,
                "proof_hash": entries.keccak_hex(bytes.fromhex(proof["proof_hex"].removeprefix("0x"))),
                "proving_ms": proof["proving_ms"],
                "verified_locally": True,
            },
        )
        self.tree.done(node)

        cid, pin = self._pin(entry, node)
        entry_id = entries.derive_entry_id(
            cid, entry["score_hash_old"], entry["score_hash_new"], entry["task_signature"], entry["agent_address"]
        )
        save_record(self.sink, entry_id, cid, entry)
        self.sink.emit("ipfs.pinned", {"entry_id": entry_id, "cid": cid, "gateway_url": self.gateway_url})

        submit = self.tree.node(pin, "submit", entry["to_version"], "Submit on-chain")
        self.sink.emit("chain.tx", {"entry_id": entry_id, "tx": None, "status": "pending", "etherscan_url": None})
        reply = self._post(
            "/submit",
            {
                "agent_id": self.agent_id,
                "entry_id": entry_id,
                "task_signature": entry["task_signature"],
                "cid": cid,
                "score_hash_old": entry["score_hash_old"],
                "score_hash_new": entry["score_hash_new"],
                "proof_hex": proof["proof_hex"],
                "instances": proof["instances"],
                "supersedes": entry["supersedes"],
            },
        )
        self._emit_tx(entry_id, reply)
        self.tree.done(submit)
        self.sink.emit(
            "chain.verified",
            {"entry_id": entry_id, "verifier_ok": True, "reward_wei": reply["reward_wei"], "tier": reply["tier"]},
        )
        self.reporter_entry_id = entry_id
        return entry_id

    def settle_regression(self, entry, parent_id, reason):
        cid, pin = self._pin(entry, parent_id)
        entry_id = entries.derive_negative_entry_id(cid, entry["task_signature"], entry["agent_address"])
        save_record(self.sink, entry_id, cid, entry)
        self.sink.emit("ipfs.pinned", {"entry_id": entry_id, "cid": cid, "gateway_url": self.gateway_url})
        submit = self.tree.node(pin, "submit", entry["to_version"], "Submit on-chain")
        reply = self._post(
            "/submit-negative",
            {
                "agent_id": self.agent_id,
                "entry_id": entry_id,
                "task_signature": entry["task_signature"],
                "cid": cid,
                "supersedes": entry["supersedes"],
            },
        )
        self._emit_tx(entry_id, reply)
        self.tree.done(submit)
        self.sink.emit(
            "regression.recorded",
            {"from": entry["from_version"], "to": entry["to_version"], "reason": reason, "entry_id": entry_id},
        )
        return entry_id
