import type { StoryFacts } from "@/components/Story";
import { REAL_RUN_ID, bakedRun } from "./baked";
import { experiment, isProven } from "./experiment";

// Read on the server and passed down, so the landing bundle does not carry the recorded runs.
export function storyFacts(): StoryFacts {
  const { proven, trials, task_signature } = experiment;
  const run = bakedRun(REAL_RUN_ID);
  const finished = run?.events.find((event) => event.type === "run.finished");
  const totals = finished?.type === "run.finished" ? finished.data.scores_by_version : {};
  return {
    oldTotal: Number(totals.V1),
    newTotal: Number(totals.V2),
    offTotal: proven.off_total,
    onTotal: proven.on_total,
    delta: proven.delta,
    proven: isProven(experiment),
    trials,
    task: task_signature,
    // The critic writes paragraphs, and the landing has room for one sentence.
    finding: run?.findings.V1?.[0].issue.split(/(?<=\.)\s/)[0] ?? "",
  };
}
