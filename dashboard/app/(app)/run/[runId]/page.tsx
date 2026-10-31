"use client";

import { useCallback, useState } from "react";
import "@/app/styles/run.css";
import { MemoryPanel } from "@/components/MemoryPanel";
import { NodeInspector } from "@/components/NodeInspector";
import { rippleChange } from "@/components/Ripple";
import { RunCanvas } from "@/components/RunCanvas";
import { RunNotFound } from "@/components/RunNotFound";
import { RunStatus } from "@/components/RunStatus";
import { ScoreRibbon } from "@/components/ScoreRibbon";
import { Transport } from "@/components/Transport";
import { useRunRoute } from "@/lib/store";

export default function RunPage({ params }: { params: { runId: string } }) {
  const run = useRunRoute(params.runId);
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = useCallback((id: string) => rippleChange(() => setSelected((current) => (current === id ? null : id))), []);

  if (!run) return <RunNotFound id={params.runId} />;

  const node = selected ? run.nodes[selected] : undefined;

  return (
    <div className="run" data-inspector={Boolean(node)} data-memory={run.memoryEnabled}>
      <ScoreRibbon run={run} />
      {run.memoryEnabled ? <MemoryPanel run={run} /> : null}
      <div className="canvas">
        <div className="canvas-head">
          <RunStatus run={run} />
          <Transport runId={params.runId} />
        </div>
        <RunCanvas run={run} selected={selected} onSelect={toggle} />
      </div>
      {node ? <NodeInspector run={run} node={node} onClose={() => rippleChange(() => setSelected(null))} /> : null}
    </div>
  );
}
