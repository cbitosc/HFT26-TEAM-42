export interface DiffLine {
  kind: "context" | "add" | "del";
  text: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// diff.ready only carries the unified diff, so this is all the UI has to render from.
export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldNumber = 0;
  let newNumber = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    const match = HUNK.exec(line);
    if (match) {
      current = { header: line, lines: [] };
      hunks.push(current);
      oldNumber = Number(match[1]);
      newNumber = Number(match[2]);
      continue;
    }
    if (!current || line === "" || line.startsWith("\\")) continue;
    const text = line.slice(1);
    if (line[0] === "+") current.lines.push({ kind: "add", text, newNumber: newNumber++ });
    else if (line[0] === "-") current.lines.push({ kind: "del", text, oldNumber: oldNumber++ });
    else current.lines.push({ kind: "context", text, oldNumber: oldNumber++, newNumber: newNumber++ });
  }
  return hunks;
}

// Pairs each run of removals with the additions that follow it.
export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === "context") {
      rows.push({ left: lines[i], right: lines[i] });
      i += 1;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (lines[i]?.kind === "del") removed.push(lines[i++]);
    while (lines[i]?.kind === "add") added.push(lines[i++]);
    for (let n = 0; n < Math.max(removed.length, added.length); n++) rows.push({ left: removed[n], right: added[n] });
  }
  return rows;
}
