"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Tier } from "@/lib/events";
import { truncateHash } from "@/lib/format";
import type { Source } from "@/lib/store";

const GLYPHS = {
  tick: "M3 8.5 6.5 12 13 4",
  cross: "M4 4l8 8M12 4l-8 8",
  crack: "M8.5 1.5 6.5 6l3 2-2.5 3 1 3.5",
  mirror: "M1.5 8h13M4.5 5h7M6 2.5h4M4.5 11h7M6 13.5h4",
  external: "M6.5 3.5h6v6M12.5 3.5l-8 8",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  play: "M5 3.5v9l7-4.5z",
  pause: "M5.5 3.5v9M10.5 3.5v9",
  restart: "M3.5 8a4.5 4.5 0 1 0 1.5-3.4M3.5 2.5v3h3",
  live: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  sample: "M3 3h10v10H3z",
  hourglass: "M4 2.5h8M4 13.5h8M5 2.5c0 3 6 3.5 6 5.5s-6 2.5-6 5.5M11 2.5c0 3-6 3.5-6 5.5s6 2.5 6 5.5",
  document: "M3.5 1.5h6l3 3v10h-9zM5.75 9 7.25 10.5 10.25 7",
  pin: "M8 10.5v4M5 1.5h6M6 1.5v4.25L4 8v2.5h8V8L10 5.75V1.5",
  send: "M14.5 1.5 1.5 6.5l5 2 2 5.5zM14.5 1.5l-8 7",
  shield: "M8 1.5 13 3.5v4c0 3.2-2 5.3-5 7-3-1.7-5-3.8-5-7v-4zM5.5 8 7.25 9.75 10.5 6.25",
  eth: "M8 1.5 12.5 8 8 14.5 3.5 8zM3.5 8 8 10l4.5-2",
};

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, size = 13 }: { name: GlyphName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <path d={GLYPHS[name]} />
    </svg>
  );
}

const CUTS = ["100", "70", "50", "35", "20", "10", "0"];
const SEALED = 1;
const CLEAN = CUTS.length - 1;
const STEP_MS = 60;
const ENTRANCE_MS = 2000;

// Stays true once enough of the element is on screen, so its entrance plays one time.
export function useSeen<T extends HTMLElement>(amount = 0.2) {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { once: true, amount });
  return { ref, seen };
}

// For data-entrance in app/styles/entrance.css. Goes on an element that is always mounted, since the
// watcher starts with it. Use amount 0 on anything that can outgrow the screen.
export function useEntrance<T extends HTMLElement>(amount = 0.2) {
  const { ref, seen } = useSeen<T>(amount);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (!seen) return;
    const timer = setTimeout(() => setPlayed(true), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, [seen]);

  return { ref, entrance: played ? "done" : seen ? "play" : "wait" };
}

// Runs from `from` on arrival, then from the old value whenever the value changes.
export function CountUp({ value, from = value, delay = 0 }: { value: number; from?: number; delay?: number }) {
  const [shown, setShown] = useState(from);
  const previous = useRef(from);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setShown(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.6,
      delay,
      ease: "easeOut",
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, delay, reduced]);

  return <>{shown}</>;
}

let fontsRequested = false;

// Committed text is set in a degraded Redaction cut, then steps to clean when proven.
export function Develop({
  proven,
  children,
  className = "",
}: {
  proven: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [cut, setCut] = useState(proven ? CLEAN : SEALED);
  const previous = useRef(proven);

  useEffect(() => {
    if (fontsRequested || !document.fonts) return;
    fontsRequested = true;
    CUTS.forEach((c) => document.fonts.load(`48px "Redaction${c === "0" ? "" : ` ${c}`}"`));
  }, []);

  useEffect(() => {
    if (proven === previous.current) return;
    previous.current = proven;
    if (!proven) {
      setCut(SEALED);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCut(CLEAN);
      return;
    }
    let next = SEALED;
    const timer = setInterval(() => {
      next += 1;
      setCut(next);
      if (next >= CLEAN) clearInterval(timer);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [proven]);

  return (
    <span className={className} data-cut={CUTS[cut]}>
      {children}
    </span>
  );
}

export function HashChip({
  value,
  href,
  head,
  tail,
  note,
}: {
  value: string;
  href?: string;
  head?: number;
  tail?: number;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <span className="hash">
      <button type="button" onClick={copy} title={value} aria-label={`Copy ${value}`}>
        {truncateHash(value, head, tail)}
        <Glyph name={copied ? "tick" : "copy"} size={12} />
      </button>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" aria-label="Open source">
          <Glyph name="external" size={12} />
        </a>
      ) : null}
      {note ? <span className="notice">{note}</span> : null}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}

const STATUS: Record<string, { text: string; glyph: GlyphName; tone?: string }> = {
  running: { text: "running", glyph: "restart" },
  done: { text: "done", glyph: "tick" },
  failed: { text: "failed", glyph: "cross", tone: "regression" },
  verified: { text: "verified", glyph: "tick", tone: "verified" },
  regression: { text: "regression", glyph: "crack", tone: "regression" },
  avoid: { text: "avoid", glyph: "crack", tone: "regression" },
  unverified: { text: "unverified", glyph: "crack", tone: "regression" },
  measured: { text: "measured, not proven", glyph: "sample" },
  proven: { text: "verified", glyph: "tick" },
  held: { text: "held up", glyph: "tick" },
  notHeld: { text: "did not hold up", glyph: "crack", tone: "regression" },
};

export function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  const { text, glyph, tone } = STATUS[status];
  return (
    <span className="badge" data-tone={tone}>
      <Glyph name={glyph} size={12} />
      {text}
    </span>
  );
}

const TIER_LEVEL: Record<Tier, number> = { candidate: 1, validated: 2, trusted: 3, canonical: 4 };

export function TierBadge({ tier }: { tier: Tier }) {
  const level = TIER_LEVEL[tier];
  return (
    <span className="badge" title={`Tier ${level} of 4`}>
      <span className="tier-marks" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} data-on={n <= level} />
        ))}
      </span>
      {tier}
    </span>
  );
}

const SOURCES: Record<Source | "recorded", { glyph: GlyphName; text: string }> = {
  recorded: { glyph: "mirror", text: "Recorded result" },
  live: { glyph: "live", text: "Live" },
  replay: { glyph: "play", text: "Replay" },
  baked: { glyph: "sample", text: "Sample data" },
};

// With onPress the badge is a control as well as a label, as it is for a run that can be replayed.
export function LiveBadge({ source, suffix, onPress }: { source: Source | "recorded"; suffix?: string; onPress?: () => void }) {
  const { glyph, text } = SOURCES[source];
  const content = (
    <>
      <Glyph name={glyph} size={11} />
      {text}
      {suffix ? ` ${suffix}` : ""}
    </>
  );
  if (onPress) {
    return (
      <button type="button" className="source-badge" data-source={source} onClick={onPress}>
        {content}
      </button>
    );
  }
  return (
    <span className="source-badge" data-source={source}>
      {content}
    </span>
  );
}

export const OFFLINE_NOTE = "Recorded run. Its scores are real. Its proof and chain steps were simulated offline.";

export function SampleNote() {
  return <p className="sample-note">Sample data. No transaction exists.</p>;
}
