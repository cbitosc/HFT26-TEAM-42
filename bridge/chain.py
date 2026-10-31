import json
import os
import threading
import time
from pathlib import Path

from web3 import Web3
from web3.exceptions import ContractCustomError, ContractLogicError
from web3.logs import DISCARD

ROOT = Path(__file__).parent.parent
SHARED = ROOT / "shared"
SIBLINGS = ROOT / "agent" / "tasks" / "siblings.json"
TIERS = ["Candidate", "Validated", "Trusted", "Canonical"]
ZERO = "0x" + "00" * 32
DAY_S = 86400
TX_TIMEOUT_S = 300


def task_hash(signature):
    return Web3.keccak(text=signature)


def hex32(value):
    return "0x" + bytes(value).hex()


def related_tasks(signature):
    siblings = json.loads(SIBLINGS.read_text(encoding="utf-8"))
    return [signature, *siblings.get(signature, [])]


def confidence(evidence, now):
    """evidence is [(timestamp, supported)]. Advisory only, the tier comes from chain counts."""
    if not evidence:
        return 0.5
    weights = {True: 0.0, False: 0.0}
    for timestamp, supported in evidence:
        weights[supported] += 0.5 ** ((now - timestamp) / DAY_S / 7)
    value = weights[True] / (weights[True] + weights[False])
    idle_days = (now - max(timestamp for timestamp, _ in evidence)) / DAY_S
    return max(0.0, value - 0.05 * int(idle_days / 30))


class ChainRejected(Exception):
    """The contract refused the call. Raised before any gas is spent."""


class Chain:
    def __init__(self, w3, registry, keys, from_block=0):
        self.w3 = w3
        abi = json.loads((SHARED / "abi" / "MemoryRegistry.json").read_text(encoding="utf-8"))
        self.registry = w3.eth.contract(address=Web3.to_checksum_address(registry), abi=abi)
        self.accounts = {agent: w3.eth.account.from_key(key) for agent, key in keys.items()}
        self.from_block = from_block
        self.lock = threading.Lock()
        self.errors = {
            Web3.keccak(text=f"{item['name']}()")[:4].hex().removeprefix("0x"): item["name"]
            for item in abi
            if item["type"] == "error" and not item["inputs"]
        }

    @property
    def chain_id(self):
        return self.w3.eth.chain_id

    def _send(self, agent_id, call):
        account = self.accounts.get(agent_id)
        if account is None:
            raise ChainRejected(f"No key configured for {agent_id}")
        with self.lock:
            try:
                call.call({"from": account.address})
            except ContractCustomError as error:
                selector = str(error.data).removeprefix("0x")[:8]
                raise ChainRejected(self.errors.get(selector, selector)) from error
            except ContractLogicError as error:
                raise ChainRejected(str(error)) from error
            tx = call.build_transaction(
                {"from": account.address, "nonce": self.w3.eth.get_transaction_count(account.address, "pending")}
            )
            tx_hash = self.w3.eth.send_raw_transaction(account.sign_transaction(tx).raw_transaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=TX_TIMEOUT_S)
        if receipt.status != 1:
            raise ChainRejected(f"Transaction reverted: {hex32(tx_hash)}")
        return receipt

    def submit(
        self, agent_id, entry_id, task_signature, cid, score_hash_old, score_hash_new, proof_hex, instances, supersedes=None
    ):
        receipt = self._send(
            agent_id,
            self.registry.functions.submitImprovement(
                entry_id,
                task_hash(task_signature),
                cid,
                score_hash_old,
                score_hash_new,
                bytes.fromhex(proof_hex.removeprefix("0x")),
                [int(value, 16) for value in instances],
                supersedes or ZERO,
            ),
        )
        paid = self.registry.events.RewardPaid().process_receipt(receipt, errors=DISCARD)
        return {
            "tx": hex32(receipt.transactionHash),
            "status": "verified",
            "block": receipt.blockNumber,
            "reward_wei": sum(event.args.amount for event in paid),
            "tier": TIERS[self.registry.functions.getEntry(entry_id).call()[6]],
        }

    def submit_negative(self, agent_id, entry_id, task_signature, cid, supersedes=None):
        call = self.registry.functions.submitNegative(entry_id, task_hash(task_signature), cid, supersedes or ZERO)
        receipt = self._send(agent_id, call)
        return {"tx": hex32(receipt.transactionHash), "block": receipt.blockNumber}

    def evidence(self, agent_id, reused_entry_id, supported, reporter_entry_id):
        call = self.registry.functions.postEvidence(reused_entry_id, supported, reporter_entry_id)
        receipt = self._send(agent_id, call)
        return {"tx": hex32(receipt.transactionHash), "block": receipt.blockNumber}

    def _evidence_log(self):
        """Returns {entry_id: [(timestamp, supported)]}, or None if the RPC refuses the log range."""
        try:
            logs = self.registry.events.EvidencePosted().get_logs(from_block=self.from_block)
            stamps = {}
            found = {}
            for log in logs:
                block = log.blockNumber
                stamps.setdefault(block, self.w3.eth.get_block(block).timestamp)
                found.setdefault(hex32(log.args.entryId), []).append((stamps[block], log.args.supported))
            return found
        except Exception:
            return None

    def memory(self, signature, k, fetch):
        """Ranked entries for a task and its siblings. fetch(cid) resolves the pinned blob."""
        log = self._evidence_log()
        now = int(time.time())
        ranked = []
        for task in related_tasks(signature):
            for entry_id in self.registry.functions.entriesByTask(task_hash(task)).call():
                row = self.registry.functions.getEntry(entry_id).call()
                cid, tier, supported, contradicted, created_at = row[2], row[6], row[7], row[8], row[10]
                if log is None:
                    evidence = [(created_at, True)] * supported + [(created_at, False)] * contradicted
                else:
                    evidence = log.get(hex32(entry_id), [])
                try:
                    entry = fetch(cid)
                except Exception:
                    continue
                ranked.append(
                    {
                        "entry_id": hex32(entry_id),
                        "cid": cid,
                        "tier": TIERS[tier],
                        "confidence": round(confidence(evidence, now), 4),
                        "disputed": contradicted > supported,
                        "entry": entry,
                    }
                )
        ranked.sort(key=lambda item: (TIERS.index(item["tier"]), item["confidence"]), reverse=True)
        return ranked[: max(k, 0)]


def deployment():
    """Prefers env addresses, then the committed deployment file."""
    path = SHARED / "deployments.sepolia.json"
    deployed = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    registry = os.environ.get("REGISTRY_ADDRESS") or deployed.get("registry")
    return registry, int(os.environ.get("REGISTRY_FROM_BLOCK") or deployed.get("deployBlock", 0))


def load_chain():
    rpc = os.environ.get("SEPOLIA_RPC_URL")
    registry, from_block = deployment()
    if not rpc or not registry:
        return None
    keys = {
        agent: os.environ[name]
        for agent, name in (
            ("agentA", "AGENT_A_PRIVATE_KEY"),
            ("agentB", "AGENT_B_PRIVATE_KEY"),
            ("deployer", "DEPLOYER_PRIVATE_KEY"),
        )
        if os.environ.get(name)
    }
    return Chain(Web3(Web3.HTTPProvider(rpc)), registry, keys, from_block)
