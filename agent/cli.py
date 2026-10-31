import argparse
import json
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv

from agent import correction, experiment, loop, memory, reputation
from agent.events import EventSink
from agent.llm import FeatherlessClient, OfflineClient
from agent.settlement import BakedSettlement, ChainSettlement

# Baked runs never touch the chain, so they need no wallet.
STUB_AUTHOR = "0x" + "00" * 20


def parse_args(argv=None):
    parser = argparse.ArgumentParser(prog="python -m agent")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--task", required=True)
    run.add_argument("--agent", choices=["A", "B"], required=True)
    run.add_argument("--memory", choices=["on", "off"], default="off")
    run.add_argument("--offline", action="store_true")
    run.add_argument("--chain", action="store_true", help="settle on-chain even with --offline LLM replay")
    run.add_argument("--no-chain", action="store_true", help="live models with baked settlement")
    run.add_argument("--scenario", choices=["clean", "regression"], default="clean")
    run.add_argument("--run-id")
    seed = commands.add_parser("seed-memory")
    seed.add_argument("--run-id", required=True)
    ab = commands.add_parser("experiment")
    ab.add_argument("--task", default="ttl-cache")
    ab.add_argument("--trials", type=int, default=5)
    commands.add_parser("experiment-attest")
    review = commands.add_parser("review-experiment")
    review.add_argument("--task", default="ttl-cache")
    review.add_argument("--trials", type=int, default=5)
    probe = commands.add_parser("probe-lesson")
    probe.add_argument("--trials", type=int, default=5)
    plant = commands.add_parser("plant-lesson")
    plant.add_argument("--old", required=True, help="real scores, comma separated")
    plant.add_argument("--new", required=True, help="real scores, comma separated")
    challenge = commands.add_parser("challenge-lesson")
    challenge.add_argument("--entry-id", required=True)
    challenge.add_argument("--reporter-entry-id", required=True)
    challenge.add_argument("--trials", type=int, default=5)
    commands.add_parser("reviewer-reputation")
    return parser.parse_args(argv)


def chain_settlement(letter):
    from eth_account import Account

    agent_id = f"agent{letter}"
    sink = EventSink(f"correction-{agent_id}-{int(time.time())}", agent_id, os.environ["BRIDGE_URL"], os.environ.get("BRIDGE_TOKEN"))
    settlement = ChainSettlement(
        sink,
        loop.Tree(sink),
        os.environ["BRIDGE_URL"],
        agent_id,
        token=os.environ.get("BRIDGE_TOKEN"),
        rpc_url=os.environ.get("SEPOLIA_RPC_URL"),
        registry=os.environ.get("REGISTRY_ADDRESS"),
    )
    return settlement, Account.from_key(os.environ[f"AGENT_{letter}_PRIVATE_KEY"]).address


def main(argv=None):
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    args = parse_args(argv)
    if args.command == "seed-memory":
        seeded = memory.seed_from_run(Path("runs") / args.run_id)
        print(f"seeded {len(seeded)} entries from {args.run_id}")
        return
    if args.command == "experiment":
        result = experiment.run(FeatherlessClient(), args.task, memory.retrieve_baked(), args.trials)
        experiment.OUTPUT.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
        print(f"off {result['off']['mean_total']} on {result['on']['mean_total']} wrote {experiment.OUTPUT}")
        return
    if args.command == "review-experiment":
        stamp = int(time.time())
        output = experiment.RUNS_DIR / f"review-experiment-{args.task}-{stamp}.json"
        output.parent.mkdir(exist_ok=True)
        result = experiment.compare_reviewers(FeatherlessClient(), args.task, args.trials, output, stamp)
        print(f"{len(result['control'])} control, {len(result['panel'])} panel, wrote {output}")
        return
    if args.command == "probe-lesson":
        output = experiment.RUNS_DIR / f"lesson-probe-{int(time.time())}.json"
        output.parent.mkdir(exist_ok=True)
        result = correction.probe(FeatherlessClient(), "ttl-cache", correction.PLANTED_TTL, args.trials, output)
        print(json.dumps(result, indent=1))
        return
    if args.command == "reviewer-reputation":
        table = reputation.score(reputation.load(sorted(experiment.RUNS_DIR.glob("review-experiment-*.json"))))
        reputation.OUTPUT.write_text(json.dumps(table, indent=1) + "\n", encoding="utf-8")
        print(json.dumps(table, indent=1))
        return
    if args.command == "plant-lesson":
        settlement, author = chain_settlement("A")
        old, new = [[int(score) for score in text.split(",")] for text in (args.old, args.new)]
        print(correction.plant(settlement, author, old, new), settlement.last_tx["tx"])
        return
    if args.command == "challenge-lesson":
        settlement, _ = chain_settlement("B")
        result = correction.challenge(FeatherlessClient(), settlement, args.entry_id, args.reporter_entry_id, args.trials)
        print(json.dumps(result, indent=1))
        return
    if args.command == "experiment-attest":
        from eth_account import Account

        sink = EventSink(f"ab-attest-{int(time.time())}", "agentB", os.environ["BRIDGE_URL"], os.environ.get("BRIDGE_TOKEN"))
        settlement = ChainSettlement(sink, loop.Tree(sink), os.environ["BRIDGE_URL"], "agentB", token=os.environ.get("BRIDGE_TOKEN"))
        author = Account.from_key(os.environ["AGENT_B_PRIVATE_KEY"]).address
        result = experiment.attest(json.loads(experiment.OUTPUT.read_text(encoding="utf-8")), settlement, author)
        experiment.OUTPUT.write_text(json.dumps(result, indent=1) + chr(10), encoding="utf-8")
        print(result["proven"])
        return
    agent_id = f"agent{args.agent}"
    run_id = args.run_id or f"{args.task}-{agent_id}-{int(time.time())}"

    offline = args.offline or os.environ.get("OFFLINE") == "1"
    llm = OfflineClient(args.task, args.scenario) if offline else FeatherlessClient()
    sink = EventSink(run_id, agent_id, os.environ.get("BRIDGE_URL"), os.environ.get("BRIDGE_TOKEN"))
    tree = loop.Tree(sink)
    author = STUB_AUTHOR
    settlement = BakedSettlement(sink, tree)
    if args.chain or not (offline or args.no_chain):
        from eth_account import Account

        author = Account.from_key(os.environ[f"AGENT_{args.agent}_PRIVATE_KEY"]).address
        settlement = ChainSettlement(
            sink,
            tree,
            os.environ["BRIDGE_URL"],
            agent_id,
            token=os.environ.get("BRIDGE_TOKEN"),
            rpc_url=os.environ.get("SEPOLIA_RPC_URL"),
            registry=os.environ.get("REGISTRY_ADDRESS"),
        )

    best = loop.run(llm, sink, settlement, tree, args.task, agent_id, author, args.memory == "on")
    print(f"{run_id}: kept {best.name} scores={best.scores} total={best.total}")
    print(f"events: {Path(sink.path)}")
