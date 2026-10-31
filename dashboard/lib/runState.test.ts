import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baked from "../mock/baked.json";
import type { RunEvent, Scores } from "./events";
import { formatEth, normaliseTier, totalScore, truncateHash } from "./format";
import { columnsFor } from "./runLayout";
import { applyEvent, emptyRun, isRegressed, isVerified, runStatus, versionEntries, versionScores } from "./runState";

const replay = (id: string) => {
  const run = baked.runs.find((r) => r.id === id)!;
  return (run.events as RunEvent[]).reduce(applyEvent, emptyRun(id));
};

describe("scores", () => {
  it("uses the circuit weights", () => {
    expect(totalScore([70, 40, 60, 55])).toBe(5725);
    expect(totalScore([92, 75, 60, 70])).toBe(7880);
  });

  it("every baked total matches its vector", () => {
    for (const run of baked.runs) {
      for (const event of run.events as RunEvent[]) {
        // The agent reports the harness scores first, then the total once quality is in.
        if (event.type === "node.updated" && event.data.scores && event.data.total !== undefined) {
          expect(event.data.total).toBe(totalScore(event.data.scores as Scores));
        }
      }
    }
  });
});

describe("applyEvent", () => {
  it("rebuilds the real Agent B run, including a V2 that scored 0", () => {
    const run = replay("real-b");
    expect(run.phase).toBe("finished");
    expect(versionScores(run).map((v) => v.total)).toEqual([9685, 0, 10000]);
    expect(isRegressed(run, "V2")).toBe(true);
    expect(run.proofs).toHaveLength(1);
    expect(run.proofs.every((p) => p.step === 5 && p.cid && p.tx)).toBe(true);
    expect(isVerified(run, "V3")).toBe(true);
    expect(run.totalGain).toBe(315);
  });

  it("records a regression, keeps the last good version and pays nothing", () => {
    const run = replay("real-a");
    expect(versionScores(run).map((v) => v.total)).toEqual([9400, 9850, 9640]);
    expect(run.finalVersion).toBe("V2");
    expect(isRegressed(run, "V3")).toBe(true);
    expect(isVerified(run, "V3")).toBe(false);
    expect(run.proofs.map((p) => p.to)).toEqual(["V2"]);
  });

  it("links a recorded CID that has no gateway URL, and keeps the regression's tx", () => {
    const run = replay("real-a");
    const [v2, v3] = versionEntries(run);
    expect(v2.gatewayUrl).toBe(`https://gateway.pinata.cloud/ipfs/${v2.cid}`);
    expect(v3.gatewayUrl).toBe(`https://gateway.pinata.cloud/ipfs/${v3.cid}`);
    expect(v3.etherscanUrl).toContain(v3.tx);
  });

  it("synthesises the retrieve node and hangs the first version from it", () => {
    const run = replay("real-b");
    expect(run.order[0]).toBe("retrieve");
    expect(run.nodes.n1.parentId).toBe("retrieve");
    expect(run.memory).toHaveLength(8);
    expect(run.memory.filter((entry) => entry.kind === "regression")).toHaveLength(1);
  });

  it("marks a reverted tx as failed and links proofs by entry", () => {
    const base = { ts: 0, run_id: "x", agent_id: "a" };
    const events: RunEvent[] = [
      { ...base, type: "proof.started", data: { from: "V1", to: "V2" } },
      { ...base, type: "ipfs.pinned", data: { entry_id: "e", cid: "c", gateway_url: "" } },
      { ...base, type: "chain.tx", data: { entry_id: "e", tx: "t", status: "reverted", etherscan_url: "" } },
    ];
    const run = events.reduce(applyEvent, emptyRun("x"));
    expect(run.proofs[0].failed).toBe(true);
    expect(run.proofs[0].tx).toBe("t");
  });

  it("ignores updates for unknown nodes and entries", () => {
    const base = { ts: 0, run_id: "x", agent_id: "a" };
    const state = emptyRun("x");
    expect(applyEvent(state, { ...base, type: "node.updated", data: { node_id: "nope", status: "done" } })).toBe(state);
    expect(
      applyEvent(state, {
        ...base,
        type: "chain.verified",
        data: { entry_id: "nope", verifier_ok: true, reward_wei: "1", tier: 0 },
      }),
    ).toBe(state);
  });
});

describe("format", () => {
  it("normalises tier enums and strings", () => {
    expect(normaliseTier(2)).toBe("trusted");
    expect(normaliseTier("canonical")).toBe("canonical");
  });

  it("formats values", () => {
    expect(truncateHash("0x1234567890abcdef")).toBe("0x1234…cdef");
    expect(formatEth("1000000000000000")).toBe("0.0010 ETH");
  });
});

describe("bundled data", () => {
  it("holds only real runs, with real findings and the live critic", () => {
    expect(baked.runs.map((run) => run.id)).toEqual(["real-a", "real-b"]);
    for (const run of baked.runs) {
      expect(run.provenance).toBe("replay");
      expect(run.models.critic).toBe("deepseek-ai/DeepSeek-R1-0528");
      expect(Object.keys(run.findings)).toContain("V1");
      expect(replay(run.id).baked).toBe(false);
    }
  });

  it("labels every registry entry by where it came from", () => {
    const count = (origin: string) => baked.memory.filter((entry) => entry.origin === origin).length;
    expect([count("run"), count("rehearsal"), count("attestation")]).toEqual([4, 6, 2]);
    expect(baked.memory.filter((entry) => entry.kind === "regression" && entry.origin === "run")).toHaveLength(2);
  });

  it("agrees with the chain log it was exported with", () => {
    const paid = baked.chain.log.filter((row) => row.event === "RewardPaid");
    expect(baked.chain.log.filter((row) => row.event === "ImprovementRecorded")).toHaveLength(baked.memory.length);
    expect(paid.reduce((sum, row) => sum + BigInt(row.amount_wei as string), 0n)).toBe(BigInt(baked.chain.balances.total_paid_wei));
    expect(baked.chain.log.every((row) => row.ts > 0 && row.tx.startsWith("0x"))).toBe(true);
  });
});

// A run recorded by the agent itself, offline. Its critique, prove and pin nodes hang off the
// tree the way agent/loop.py really emits them, including a regression that branches from V1.
const recorded =readFileSync(new URL("../../shared/sample_events.jsonl", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as RunEvent);
const recordedRun = () => recorded.reduce(applyEvent, emptyRun("sample"));

describe("the agent's real stream", () => {
  it("normalises tier names and keeps the entry kind", () => {
    const { memory } = recordedRun();
    expect(memory.map((entry) => entry.tier)).toEqual(["validated", "candidate"]);
    expect(memory[1].kind).toBe("regression");
    expect(normaliseTier("Trusted")).toBe("trusted");
  });

  it("keeps the CID and tx of a regression, which has no proof", () => {
    const run = recordedRun();
    expect(run.proofs.map((p) => p.to)).toEqual(["V3"]);
    const v2 = versionEntries(run).find((entry) => entry.to === "V2");
    expect(v2?.cid).toMatch(/^baked-/);
    expect(v2?.tx).toMatch(/^baked-tx-/);
  });

  it("labels offline runs as baked", () => {
    expect(recordedRun().baked).toBe(true);
    expect(replay("real-a").baked).toBe(false);
  });

  it("survives the bridge resending its history", () => {
    const once = recordedRun();
    const twice = recorded.reduce(applyEvent, once);
    expect(twice.proofs).toEqual(once.proofs);
    expect(twice.regressions).toEqual(once.regressions);
    expect(twice.order).toEqual(once.order);
  });

  it("does not hand a resent pin to the next proof", () => {
    const pinned = recorded.findIndex((event) => event.type === "ipfs.pinned" && event.data.entry_id.startsWith("0xdd1b"));
    const midway = recorded.slice(0, pinned + 1).reduce(applyEvent, emptyRun("sample"));
    const next: RunEvent = { ...recorded[0], type: "proof.started", data: { from: "V3", to: "V4" } };
    const resent = [next, recorded[pinned]].reduce(applyEvent, midway);
    expect(resent.proofs.find((p) => p.to === "V4")?.entryId).toBeUndefined();
  });

  it("reports what the run is doing", () => {
    expect(runStatus(emptyRun("x"))).toBe("Waiting for the first event.");
    expect(runStatus(recordedRun())).toBe("Kept V3, +2400 over V1.");
    const proving = recorded.findIndex((event) => event.type === "proof.started");
    expect(runStatus(recorded.slice(0, proving + 1).reduce(applyEvent, emptyRun("sample")))).toBe("Proving V3 beat V1");
  });

  it("shows the reason a transaction reverted", () => {
    const entry_id = "0xdd1b57cf1e2f1870f022bc16a3d4e77541fd616dad3b5fc5592cd2d0b5695c5c";
    const pinned = recorded.findIndex((event) => event.type === "ipfs.pinned" && event.data.entry_id === entry_id);
    const reverted: RunEvent = {
      ...recorded[0],
      type: "chain.tx",
      data: { entry_id, tx: null, status: "reverted", etherscan_url: null, reason: "score did not improve" },
    };
    const run = [...recorded.slice(0, pinned + 1), reverted].reduce(applyEvent, emptyRun("sample"));
    expect(runStatus(run)).toBe("The contract rejected this proof: score did not improve.");
  });
});

describe("version columns", () => {
  const nodeIds = (column: ReturnType<typeof columnsFor>[number]) =>
    [column.code, column.score, column.critique, ...column.settlement].flatMap((node) => (node ? [node.id] : []));

  it("places every step in exactly one column", () => {
    for (const run of [recordedRun(), ...baked.runs.map((r) => replay(r.id))]) {
      const placed = columnsFor(run).flatMap(nodeIds).sort();
      expect(placed).toEqual(run.order.filter((id) => id !== "retrieve").sort());
    }
  });

  it("sinks a failed version and names the one that was kept", () => {
    const [, second] = columnsFor(recordedRun());
    expect(second).toMatchObject({ version: "V2", state: "crack", kept: "V1", gain: undefined });
  });

  it("measures gain from the last version that held", () => {
    const [first, , third] = columnsFor(recordedRun());
    expect(third.gain).toBe((third.score?.total as number) - (first.score?.total as number));
  });

  it("links a critique to the revise it produced", () => {
    const [first, second] = columnsFor(recordedRun());
    expect(first.feedsNext).toBe(true);
    // V3 branches from V1, so the critique of V2 fed nothing.
    expect(second.feedsNext).toBe(false);
  });

  it("marks the version the run kept", () => {
    const run = replay("real-a");
    expect(columnsFor(run).filter((column) => column.final).map((column) => column.version)).toEqual([run.finalVersion]);
  });
});
