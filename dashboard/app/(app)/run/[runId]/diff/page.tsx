"use client";

import { DiffViewer } from "@/components/DiffViewer";
import { RunNotFound } from "@/components/RunNotFound";
import { useRunRoute } from "@/lib/store";

export default function DiffPage({ params }: { params: { runId: string } }) {
  const run = useRunRoute(params.runId);
  if (!run) return <RunNotFound id={params.runId} />;
  return <DiffViewer run={run} />;
}
