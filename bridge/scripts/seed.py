"""Put entries from real agent runs on-chain so the demo has depth. See docs/05-TRACK-CHAIN-STORAGE.md.

Only replays what runs/<run_id>/entries/ recorded, never hand-written lessons, because
inherited memory has to be real for the A/B result to mean anything.

    python bridge/scripts/seed.py --runs <run_id> [<run_id> ...]          # Sepolia + Pinata, using .env
    python bridge/scripts/seed.py --local --runs <run_id>                 # Anvil, labelled baked CIDs
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.append(str(ROOT / "zk"))
from bridge.chain import Chain  # noqa: E402
from bridge.store import EntryStore  # noqa: E402
from hash import score_hash  # noqa: E402
from prove import prove  # noqa: E402

SHARED = ROOT / "shared"
LOCAL_RPC = "http://127.0.0.1:8545"


def load_records(run_ids):
    records = []
    for run_id in run_ids:
        paths = sorted((ROOT / "runs" / run_id / "entries").glob("*.json"))
        if not paths:
            raise SystemExit(f"No recorded entries in runs/{run_id}/entries")
        records += [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    return records


def for_wallet(entry, address):
    """Rebinds a recorded entry to the wallet submitting it, with real Poseidon commitments."""
    blob = {key: value for key, value in entry.items() if key != "placeholder"}
    blob["agent_address"] = address
    blob["score_hash_old"] = score_hash(entry["scores"]["old"])
    blob["score_hash_new"] = score_hash(entry["scores"]["new"])
    return blob


def entry_id_for(blob, cid):
    task = Web3.keccak(text=blob["task_signature"])
    address = blob["agent_address"]
    if blob["kind"] == "regression":
        return Web3.solidity_keccak(["string", "bytes32", "address"], [cid, task, address])
    return Web3.solidity_keccak(
        ["string", "bytes32", "bytes32", "bytes32", "address"],
        [cid, blob["score_hash_old"], blob["score_hash_new"], task, address],
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", nargs="+", required=True, help="run ids under runs/")
    parser.add_argument("--local", action="store_true", help="Anvil rehearsal with baked CIDs")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env")

    network = "local" if args.local else "sepolia"
    deployment = json.loads((SHARED / f"deployments.{network}.json").read_text(encoding="utf-8"))
    rpc = LOCAL_RPC if args.local else os.environ["SEPOLIA_RPC_URL"]
    baked = SHARED / "baked" / ("local" if args.local else "")
    (baked / "proofs").mkdir(parents=True, exist_ok=True)
    (baked / "entries").mkdir(exist_ok=True)

    keys = {"agentA": os.environ["AGENT_A_PRIVATE_KEY"], "agentB": os.environ["AGENT_B_PRIVATE_KEY"]}
    chain = Chain(Web3(Web3.HTTPProvider(rpc)), deployment["registry"], keys, deployment.get("deployBlock", 0))
    store = EntryStore(ROOT / "cache" / "entries", jwt=os.environ.get("PINATA_JWT"))
    report = {"chainId": deployment["chainId"], "registry": deployment["registry"], "entries": []}

    for record in load_records(args.runs):
        entry = record["entry"]
        agent_id = entry["agent_id"]
        blob = for_wallet(entry, chain.accounts[agent_id].address)
        cid = store.pin_baked(blob) if args.local else store.pin(blob)
        (baked / "entries" / f"{cid}.json").write_text(json.dumps(blob, sort_keys=True, indent=2) + "\n", encoding="utf-8")

        entry_id = "0x" + entry_id_for(blob, cid).hex().removeprefix("0x")
        name = f"{blob['task_signature']}-{blob['from_version']}-{blob['to_version']}"
        if blob["kind"] == "regression":
            reply = chain.submit_negative(agent_id, entry_id, blob["task_signature"], cid)
        else:
            proof = prove(blob["scores"]["old"], blob["scores"]["new"])
            (baked / "proofs" / f"{name}.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
            reply = chain.submit(
                agent_id, entry_id, blob["task_signature"], cid, blob["score_hash_old"], blob["score_hash_new"],
                proof["proof_hex"], proof["instances"],
            )
        report["entries"].append(
            {"name": name, "entry_id": entry_id, "cid": cid, "tx": reply["tx"], "kind": blob["kind"], "agent_id": agent_id}
        )
        print(f"{name} ({blob['kind']}): {reply['tx']}")

    report["seeded_at"] = int(time.time())
    (baked / "seed.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("wrote", baked / "seed.json")


if __name__ == "__main__":
    main()
