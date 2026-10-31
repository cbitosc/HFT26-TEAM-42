"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { bakedRun } from "@/lib/baked";
import { useRuns } from "@/lib/store";
import { trackGlassLight } from "./GlassNav";
import { ReplayMenu } from "./ReplayMenu";
import { rippleChange } from "./Ripple";
import { LiveBadge } from "./ui";

export function Dock() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeRunId, runIds, runs, liveRuns, sourceOf, playback, restart, bridgeConfigured, live, connectLive, disconnectLive } = useRuns();
  const base = `/run/${activeRunId}`;
  const tabs = [
    { href: base, label: "Run", match: (p: string) => /^\/run\/[^/]+$/.test(p) },
    { href: `${base}/diff`, label: "Changes", match: (p: string) => p.endsWith("/diff") },
    { href: `${base}/proof`, label: "Proof", match: (p: string) => p.endsWith("/proof") },
    { href: "/memory", label: "Memory", match: (p: string) => p === "/memory" },
    { href: "/experiment", label: "Compare", match: (p: string) => p === "/experiment" },
    { href: "/chain", label: "On-chain", match: (p: string) => p === "/chain" },
  ];

  const onRunChange = (id: string) => {
    const suffix = pathname.endsWith("/diff") ? "/diff" : pathname.endsWith("/proof") ? "/proof" : "";
    router.push(`/run/${id}${suffix}`);
  };

  const onRunScreen = pathname.startsWith("/run/");

  // A run that starts while connected takes the stage. Finished ones from the bridge's history do not.
  const newest = liveRuns[liveRuns.length - 1];
  const followNewest = onRunScreen && newest !== undefined && runs[newest]?.phase === "running";
  const follow = useRef(onRunChange);
  follow.current = onRunChange;
  useEffect(() => {
    if (followNewest) follow.current(newest);
  }, [followNewest, newest]);

  // Compare reads the recorded experiment, whatever the bridge is doing.
  const source = pathname === "/experiment" ? "recorded" : onRunScreen ? sourceOf(activeRunId) : live === "on" ? "live" : "recorded";
  const replaying = onRunScreen && playback.runId === activeRunId && playback.playing;

  const replay = () => {
    rippleChange(() => restart(activeRunId));
    router.push(base);
  };

  return (
    <header className="dock frost">
      <Link href="/" className="wordmark" aria-label="AutoEvolve">
        AutoEv<span className="moon-o">o</span>lve
      </Link>
      <div className="dock-tools">
        <label>
          <span className="sr-only">Run</span>
          <select className="select" value={activeRunId} onChange={(e) => onRunChange(e.target.value)}>
            {runIds.map((id) => (
              <option key={id} value={id}>
                {bakedRun(id)?.title ?? id}
              </option>
            ))}
          </select>
        </label>
        <ReplayMenu />
        {bridgeConfigured ? (
          <button
            type="button"
            className="toggle"
            aria-pressed={live !== "off"}
            onClick={live === "off" ? connectLive : disconnectLive}
          >
            {live === "off" ? "Connect live" : live === "lost" ? "Reconnecting" : "Disconnect"}
          </button>
        ) : null}
        <LiveBadge source={source} suffix={replaying ? `x${playback.speed}` : undefined} onPress={source === "replay" ? replay : undefined} />
      </div>
      <nav className="tabs" aria-label="Screens" onPointerMove={trackGlassLight}>
        {tabs.map((tab) => (
          <Link key={tab.label} href={tab.href} className="glass" aria-current={tab.match(pathname) ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
