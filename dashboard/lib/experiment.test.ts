import { describe, expect, it } from "vitest";
import { experiment, failureRows, isProven, lessons, testName } from "./experiment";
import { totalScore } from "./format";

describe("experiment", () => {
  it("reads the real five-trial result", () => {
    expect(experiment.trials).toBe(5);
    expect(experiment.off.totals).toHaveLength(5);
    expect(experiment.on.totals).toHaveLength(5);
  });

  it("every total matches its vector", () => {
    for (const arm of [experiment.off, experiment.on]) {
      expect(arm.vectors.map(totalScore)).toEqual(arm.totals);
    }
  });

  it("headlines the median paired gain, separate from the means", () => {
    const { proven, off, on } = experiment;
    const gains = off.totals.map((total, i) => on.totals[i] - total).sort((a, b) => a - b);
    expect(proven.delta).toBe(proven.on_total - proven.off_total);
    expect(proven.delta).toBe(gains[2]);
    expect(on.mean_total - off.mean_total).not.toBe(proven.delta);
  });

  it("is only proven once a tx exists", () => {
    expect(isProven({ ...experiment, proven: { ...experiment.proven, tx: null } })).toBe(false);
    expect(isProven({ ...experiment, proven: { ...experiment.proven, tx: "0xabc" } })).toBe(true);
  });

  it("orders failures from biggest fix to anything memory made worse", () => {
    const rows = failureRows(experiment);
    const repeated = rows.filter((row) => Math.max(row.off, row.on) > 1);
    expect(repeated.map((row) => [row.off, row.on])).toEqual([
      [5, 0],
      [4, 0],
      [5, 5],
      [1, 5],
    ]);
    expect(rows).toHaveLength(16);
  });

  it("gives the headline tests plain names and tidies the rest", () => {
    expect(testName("test_expiry_boundary_is_expired")).toBe("Expiry boundary");
    expect(testName("test_put_then_get")).toBe("put then get");
  });

  it("resolves the one inherited lesson from the seed", () => {
    const [lesson, ...rest] = lessons(experiment);
    expect(rest).toEqual([]);
    expect(lesson.tier).toBe("candidate");
    expect(lesson.task).toBe("lru-cache");
    expect(lesson.fixes).toHaveLength(3);
    expect(lesson.fixes.join(" ")).not.toContain("lru-cache:");
    expect(lesson.fixes.join(" ")).not.toContain("`");
  });
});
