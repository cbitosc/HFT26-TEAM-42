"use client";

import Link from "next/link";
import { useRuns } from "@/lib/store";

export function RunNotFound({ id }: { id: string }) {
  const { bridgeConfigured, live, connectLive } = useRuns();
  return (
    <div className="grid gap-4 p-8">
      <p className="label">Run not found</p>
      <h1 className="display text-5xl">No run called {id}.</h1>
      {/* Live runs only exist in memory, but the bridge resends recent ones on connect. */}
      {live === "on" ? <p className="notice">Connected. This run is not in the bridge&apos;s recent history.</p> : null}
      <div className="flex gap-3">
        {bridgeConfigured && live === "off" ? (
          <button type="button" className="btn w-fit" onClick={connectLive}>
            Connect live
          </button>
        ) : null}
        <Link href="/run/real-a" className="btn w-fit">
          Open the recorded run
        </Link>
      </div>
    </div>
  );
}
