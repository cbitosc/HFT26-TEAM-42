"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DAYBREAK, daybreakAt } from "@/lib/daybreak";
import { paletteStyle } from "@/lib/palettes";
import { paintStars } from "@/lib/sky";
import { createWater, type Water } from "@/lib/water";
import { FloodLink, useFloodPalette } from "./Flood";
import { Sky, type PaintRidges } from "./Sky";
import { GlassNav, trackGlassLight } from "./GlassNav";
import { Glyph } from "./ui";

export interface StoryFacts {
  oldTotal: number;
  newTotal: number;
  offTotal: number;
  onTotal: number;
  delta: number;
  proven: boolean;
  trials: number;
  task: string;
  finding: string;
}

interface Beat {
  title: string[];
  note: string;
  datum?: string;
  verified?: boolean;
}

const TAGLINE = "Self-improving AI agents. They prove they got better, and leave behind memory other agents can inherit.";

const beatsFor = (facts: StoryFacts): Beat[] => [
  { title: ["AutoEvolve"], note: TAGLINE },
  {
    title: ["An agent writes V1."],
    note: "The generator solves a real coding task. First attempts usually break at the edges.",
    datum: `Example: ${facts.finding}`,
  },
  {
    title: ["A different model", "reads it."],
    note: "The critic is a separate model, so the generator never grades itself. Its findings drive the next version.",
  },
  {
    title: ["A harness scores", "every version."],
    note: "Tests, adversarial cases, benchmarks and a bounded rubric produce integers a circuit can check.",
    datum: `Example: ${facts.oldTotal} to ${facts.newTotal}`,
  },
  {
    title: ["The improvement", "is proven."],
    note: "An EZKL proof shows the new score beats the old one under committed weights, and Sepolia pays the agent. It does not prove the harness ran honestly.",
    datum: "improved = 1",
    verified: true,
  },
  {
    title: ["What it learned", "stays learned."],
    note: "The diff and critique go to IPFS, and the CID goes on-chain. Entries earn trust from verified reuse. Failures are kept too, as things to avoid.",
  },
  {
    title: ["The next agent", "starts ahead."],
    note: `Agent B inherits that memory. Median paired trial of ${facts.task}: ${facts.offTotal} without it, ${facts.onTotal} with it.`,
    datum: `+${facts.delta}, ${facts.proven ? "proven on Sepolia" : "measured, not proven"}`,
  },
];

const PROVE = 4;
// Where a rising headline starts and finishes fading, as a share of the sky. These match the
// mask on .titles in story.css.
const FADE_FROM = 0.8;
const FADE_TO = 0.98;

// Scroll speed that counts as full force, in pixels per millisecond.
const FULL_SPEED = 2;
// In milliseconds, so the water behaves the same on a fast laptop and a slow projector.
const RISE_MS = 50;
const FALL_MS = 340;
// The headline floats on the swell. Two slow waves, so it never settles into an obvious loop.
const BOB_PX = 5;
const BOB_MS = 1700;
// The sky trails the scroll by this much, so a wheel notch still reads as a slow change of light.
const DAY_MS = 420;

// The moon starts as the "o" of the wordmark. It lifts off over the first beat, then crosses the
// sky and sets at dawn, and scrolling back retraces the same path to the letter.
const MOON_WORD = "AutoEvolve";
const MOON_SKY_EM = 0.168;

interface Moon {
  x: number;
  y: number;
  radius: number;
  // 0 while it sits on the letter, 1 once it is free.
  free: number;
}

const clamp = (value: number, low = 0, high = 1) => Math.min(Math.max(value, low), high);

const ascents = new Map<string, number>();

// Read from the page, because the font's own metrics are not rounded the way the browser's are.
function ascentOf(word: HTMLElement, fontSize: string) {
  const known = ascents.get(fontSize);
  if (known !== undefined) return known;
  const probe = document.createElement("span");
  probe.style.cssText = "display:inline-block;width:0;height:0";
  word.prepend(probe);
  const ascent = probe.getBoundingClientRect().bottom - word.getBoundingClientRect().top;
  probe.remove();
  ascents.set(fontSize, ascent);
  return ascent;
}

// Mirrors every headline above the water at its true height, word by word from where the DOM put
// it, so the reflection stays aligned at every width and sinks as the word rises.
function paintReflections(
  context: CanvasRenderingContext2D,
  box: DOMRect,
  titles: (HTMLElement | null)[],
  moon: Moon | null,
) {
  context.clearRect(0, 0, box.width, box.height);
  context.textBaseline = "alphabetic";
  context.textRendering = "geometricPrecision";
  context.fillStyle = "#fff";
  context.save();
  context.scale(1, -1);
  const ratio = window.devicePixelRatio || 1;
  for (const title of titles) {
    if (!title) continue;
    const bounds = title.getBoundingClientRect();
    if (bounds.top >= box.top || bounds.bottom <= 0) continue;
    const style = getComputedStyle(title);
    const presence = parseFloat(style.opacity);
    if (!presence) continue;
    if ("letterSpacing" in context) context.letterSpacing = style.letterSpacing;
    // The water always shows the clean cut, even under a redacted headline.
    context.font = `400 ${style.fontSize} Redaction`;
    title.querySelectorAll<HTMLElement>("[data-word]").forEach((word) => {
      const rect = word.getBoundingClientRect();
      // The browser pushes each baseline down onto a whole device pixel, so this does too.
      const baseline = Math.ceil((rect.top + ascentOf(word, style.fontSize)) * ratio - 0.01) / ratio;
      // A word fades from the water as it fades from the sky.
      const height = (box.top - baseline) / box.top;
      context.globalAlpha = presence * (1 - clamp((height - FADE_FROM) / (FADE_TO - FADE_FROM)));
      context.fillText(word.textContent ?? "", rect.left - box.left, baseline - box.top);
    });
  }
  if (moon) {
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(moon.x, moon.y - box.top, moon.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

// The middle of the "o" with the headline at rest, read from the type so it fits any width.
function findDot(title: HTMLElement) {
  const letter = title.querySelector<HTMLElement>("[data-dot]");
  const word = title.querySelector<HTMLElement>("[data-word]");
  const context = document.createElement("canvas").getContext("2d");
  if (!letter || !word || !context) return null;
  const style = getComputedStyle(title);
  context.font = `400 ${style.fontSize} Redaction`;
  const ink = context.measureText("o");
  const inkWidth = ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight;
  const inkHeight = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
  const risen = new DOMMatrixReadOnly(style.transform).m42;
  const rect = letter.getBoundingClientRect();
  const baseline = rect.top - risen + ascentOf(word, style.fontSize);
  return {
    x: rect.left + (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2,
    y: baseline - (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2,
    radius: Math.max(inkWidth, inkHeight) / 2,
    skyRadius: parseFloat(style.fontSize) * MOON_SKY_EM,
  };
}

// While it is the letter, the moon floats with the rest of the word.
function placeMoon(element: HTMLElement, moon: Moon, bob: number) {
  const y = moon.y - bob * (1 - moon.free);
  element.style.width = element.style.height = `${moon.radius * 2}px`;
  element.style.transform = `translate(${moon.x - moon.radius}px, ${y - moon.radius}px)`;
}

// Sets the whole scene for a moment of the night, 0 at dusk and 1 at dawn.
function showDay(stage: HTMLElement | null, water: Water | null, ridges: PaintRidges | null, day: number) {
  const scene = daybreakAt(day);
  for (const [name, value] of Object.entries(scene.vars)) stage?.style.setProperty(name, value);
  water?.setLight(scene.tint, scene.stars);
  ridges?.(scene.sky[1], scene.sky[0]);
}

// The letter the moon stands in for, marked so its position can be read from the page.
function MoonLetter({ word }: { word: string }) {
  const at = word.lastIndexOf("o");
  return (
    <>
      {word.slice(0, at)}
      <span data-dot>o</span>
      {word.slice(at + 1)}
    </>
  );
}

function Words({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, l) => (
        <span key={line}>
          {line.split(" ").map((word, w) => (
            <span key={`${word}-${w}`}>
              {w ? " " : ""}
              <span data-word>
                {word === MOON_WORD ? <MoonLetter word={word} /> : word}
              </span>
            </span>
          ))}
          {l < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

const DUSK = DAYBREAK[0].palette;

// The scene runs from dusk to dawn as the page scrolls.
export function Story({ facts }: { facts: StoryFacts }) {
  const beats = useMemo(() => beatsFor(facts), [facts]);
  const [active, setActive] = useState(0);
  const [flowing, setFlowing] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const titles = useRef<(HTMLElement | null)[]>([]);
  const track = useRef<HTMLDivElement>(null);
  const water = useRef<Water | null>(null);
  const trail = useRef<{ x: number; y: number } | null>(null);
  const ridges = useRef<PaintRidges | null>(null);
  const dayTarget = useRef(0);
  const moved = useRef(false);
  const beat = useRef(0);
  const moon = useRef<HTMLDivElement>(null);
  const moonAt = useRef<Moon | null>(null);
  const dot = useRef<ReturnType<typeof findDot>>(null);
  const last = beats.length - 1;
  // The transition leaves in the colours of this moment of the night.
  useFloodPalette(DAYBREAK.reduce((near, key) => (Math.abs(key.at - active / last) < Math.abs(near.at - active / last) ? key : near)).palette);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;

    if (!reduced && canvas.current) {
      document.fonts.load('48px "Redaction"').then(() => {
        if (cancelled || !canvas.current) return;
        water.current = createWater(
          canvas.current,
          (context, box) => paintReflections(context, box, titles.current, moonAt.current),
          DUSK.water,
          (context, box) => paintStars(context, box.width, 0, box.top, 1),
        );
        if (water.current) setFlowing(true);
      });
    }

    return () => {
      cancelled = true;
      water.current?.destroy();
      water.current = null;
    };
  }, []);

  // The page itself never moves: scroll position only drives this one stage. Lenis smooths
  // it, and it still scrolls natively, so this works with or without Lenis.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = () => {
      const range = document.documentElement.scrollHeight - window.innerHeight;
      const position = range > 0 ? clamp(window.scrollY / range) * last : 0;
      stage.current?.style.setProperty("--pos", position.toFixed(4));
      dayTarget.current = position / last;
      if (reduced) showDay(stage.current, water.current, ridges.current, dayTarget.current);

      moved.current = true;

      if (moon.current && stage.current) {
        const title = titles.current[0];
        dot.current ??= title ? findDot(title) : null;
        if (dot.current) {
          const { width, height } = stage.current.getBoundingClientRect();
          const horizon = (height * parseFloat(getComputedStyle(stage.current).getPropertyValue("--mirror"))) / 100;
          const night = position / last;
          // High over the right of the sky early on, down to the horizon by dawn.
          const skyX = width * (0.6 + 0.3 * night);
          const skyY = horizon * (0.27 + 0.73 * night ** 3);
          const free = clamp(position / 1.1);
          const eased = free * free * (3 - 2 * free);
          moonAt.current = {
            x: dot.current.x + (skyX - dot.current.x) * eased,
            y: dot.current.y + (skyY - dot.current.y) * eased,
            radius: dot.current.radius + (dot.current.skyRadius - dot.current.radius) * eased,
            free: eased,
          };
          placeMoon(moon.current, moonAt.current, 0);
          stage.current.style.setProperty("--moon-free", eased.toFixed(3));
        }
      }
      const nearest = Math.round(position);
      if (nearest !== beat.current) {
        // The next headline has just broken the surface.
        beat.current = nearest;
        setActive(nearest);
        water.current?.splash();
      }

      // The verified line comes up as this headline comes to rest.
      const cleared = clamp((position - (PROVE - 0.2)) / 0.2);
      stage.current?.style.setProperty("--clear", cleared.toFixed(3));
    };

    const remeasure = () => {
      dot.current = null;
      update();
    };

    update();
    document.fonts.ready.then(remeasure);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", remeasure);
    };
  }, [last]);

  // Scroll speed is the energy of the whole scene. It rises fast and dies away slowly, so a
  // hard scroll leaves the water moving for a moment after the page has stopped.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let lastY = window.scrollY;
    let lastTime = performance.now();
    let direction = 1;
    let energy = 0;
    let day = dayTarget.current;
    let shown = -1;
    let lit: Water | null = null;

    const liquid = (now: number) => {
      frame = requestAnimationFrame(liquid);
      const elapsed = Math.max(now - lastTime, 1);
      lastTime = now;
      day += (dayTarget.current - day) * (1 - Math.exp(-elapsed / DAY_MS));
      // The water arrives late, once the font has loaded, so it needs the current light too.
      if (Math.abs(day - shown) > 0.0002 || lit !== water.current) {
        shown = day;
        lit = water.current;
        showDay(stage.current, lit, ridges.current, day);
      }
      const bob = BOB_PX * (Math.sin(now / BOB_MS) * 0.7 + Math.sin(now / (BOB_MS * 1.73)) * 0.3);
      track.current?.style.setProperty("--bob", `${bob.toFixed(2)}px`);
      water.current?.setLift(bob);
      if (moon.current && moonAt.current) placeMoon(moon.current, moonAt.current, bob);
      if (moved.current) {
        moved.current = false;
        water.current?.repaint();
      }
      const y = window.scrollY;
      const travelled = y - lastY;
      lastY = y;
      if (travelled) direction = Math.sign(travelled);
      const force = clamp(Math.abs(travelled) / elapsed / FULL_SPEED);
      energy += (force - energy) * (1 - Math.exp(-elapsed / (force > energy ? RISE_MS : FALL_MS)));
      if (energy < 0.006) energy = 0;
      water.current?.stir(energy, direction);
    };

    frame = requestAnimationFrame(liquid);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Moving fast pushes more water, and the path is interpolated so a quick swipe leaves a wake.
  const onMove = (event: React.PointerEvent) => {
    if (!water.current) return;
    const { clientX: x, clientY: y } = event;
    const from = trail.current ?? { x, y };
    const distance = Math.hypot(x - from.x, y - from.y);
    const strength = Math.min(0.14 + distance / 170, 0.5);
    const steps = Math.min(Math.ceil(distance / 14), 12) || 1;
    for (let i = 1; i <= steps; i++) {
      water.current.poke(from.x + ((x - from.x) * i) / steps, from.y + ((y - from.y) * i) / steps, strength / steps + 0.05, 5);
    }
    trail.current = { x, y };
  };

  const onDown = (event: React.PointerEvent) => {
    water.current?.poke(event.clientX, event.clientY, 0.9, 7);
  };

  return (
    <section className="story" style={{ "--beats": beats.length } as React.CSSProperties}>
      <div
        ref={stage}
        className="stage"
        data-water={flowing ? "on" : "off"}
        style={paletteStyle(DUSK)}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerLeave={() => {
          trail.current = null;
        }}
      >
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <filter id="water" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.09" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="9" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>

        <Sky palette={DUSK} ridges={ridges} moon={moon} />

        <div className="stage-id label">
          <span className="exhibit">
            Exhibit {String(active).padStart(2, "0")}
            <span className="ticks" aria-hidden="true">
              {beats.map((_, i) => (
                <i key={i} data-on={i <= active} />
              ))}
            </span>
          </span>
          <span>AutoEvolve Protocol</span>
          <span>CBIT Hacktoberfest 26</span>
          <span>Team Hocking</span>
        </div>
        <GlassNav />

        <div ref={track} className="titles">
          {beats.map((item, i) => {
            const Heading = i === 0 ? "h1" : "h2";
            return (
              <Heading
                key={item.title.join(" ")}
                ref={(element: HTMLElement | null) => {
                  titles.current[i] = element;
                }}
                className="beat-title"
                data-hook={i === 0 || undefined}
                style={{ "--i": i } as React.CSSProperties}
                aria-label={item.title.join(" ")}
              >
                <Words lines={item.title} />
              </Heading>
            );
          })}
        </div>

        <canvas ref={canvas} className="water" aria-hidden="true" />
        <div className="reflection" data-hook={active === 0 || undefined} style={{ "--i": active } as React.CSSProperties} aria-hidden="true">
          {beats[active].title.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>

        <div className="foot">
          <div className="notes">
            {beats.map((item, i) => (
              <div key={item.note} className="beat-note" style={{ "--i": i } as React.CSSProperties}>
                <p>{item.note}</p>
                {item.datum ? (
                  <p className="beat-datum" data-verified={item.verified || undefined}>
                    {item.datum}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <span className="scroll-hint label" aria-hidden="true">
            Scroll
          </span>
          <FloodLink className="cta glass" href="/run/real-a?play=1" onPointerMove={trackGlassLight}>
            <Glyph name="play" />
            Watch a run
          </FloodLink>
        </div>
      </div>
    </section>
  );
}
