"use client";

import "@/app/styles/proof.css";
import { ProofPanel } from "@/components/ProofStepper";
import { RunNotFound } from "@/components/RunNotFound";
import { useRunRoute } from "@/lib/store";

export default function ProofPage({ params }: { params: { runId: string } }) {
  const run = useRunRoute(params.runId);
  if (!run) return <RunNotFound id={params.runId} />;
  // Keyed so that switching runs plays the entrance again instead of jumping the bars.
  return <ProofPanel key={run.id} run={run} />;
}
