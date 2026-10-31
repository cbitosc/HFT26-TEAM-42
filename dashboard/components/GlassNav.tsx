"use client";

import { FloodLink } from "./Flood";
import { Glyph } from "./ui";

const LINKS = [
  { href: "/run/real-a", label: "Run" },
  { href: "/run/real-a/diff", label: "Changes" },
  { href: "/run/real-a/proof", label: "Proof" },
  { href: "/memory", label: "Memory" },
  { href: "/experiment", label: "Compare" },
  { href: "/chain", label: "On-chain" },
];

// Light on real glass moves with the viewer, so the highlight follows the cursor.
export function trackGlassLight(event: React.PointerEvent) {
  const glass = (event.target as HTMLElement).closest<HTMLElement>(".glass");
  if (!glass) return;
  const box = glass.getBoundingClientRect();
  glass.style.setProperty("--x", `${event.clientX - box.left}px`);
  glass.style.setProperty("--y", `${event.clientY - box.top}px`);
}

export function GlassNav() {
  return (
    <nav className="glass-nav" aria-label="Screens" onPointerMove={trackGlassLight}>
      {LINKS.map((link) => (
        <FloodLink key={link.href} href={link.href} className="glass">
          {link.label}
        </FloodLink>
      ))}
      <a className="glass" href="https://github.com/Morizz00/HFT26-TEAM-42" target="_blank" rel="noreferrer">
        Source
        <Glyph name="external" size={11} />
      </a>
    </nav>
  );
}
