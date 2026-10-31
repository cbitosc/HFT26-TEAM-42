import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, toSplitRows } from "./unifiedDiff";

const DIFF = `--- V1/a.py
+++ V2/a.py
@@ -1,3 +1,4 @@
 one
-two
+TWO
+extra
 three
`;

describe("unified diff", () => {
  it("numbers old and new lines independently", () => {
    const [hunk] = parseUnifiedDiff(DIFF);
    expect(hunk.lines.map((l) => [l.kind, l.oldNumber, l.newNumber])).toEqual([
      ["context", 1, 1],
      ["del", 2, undefined],
      ["add", undefined, 2],
      ["add", undefined, 3],
      ["context", 3, 4],
    ]);
  });

  it("pairs removals with additions and pads the shorter side", () => {
    const rows = toSplitRows(parseUnifiedDiff(DIFF)[0].lines);
    expect(rows).toHaveLength(4);
    expect(rows[1].left?.text).toBe("two");
    expect(rows[1].right?.text).toBe("TWO");
    expect(rows[2].left).toBeUndefined();
    expect(rows[2].right?.text).toBe("extra");
  });
});
