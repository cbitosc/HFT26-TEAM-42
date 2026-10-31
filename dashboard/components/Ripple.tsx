"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";

const PRESSABLE = "button, summary, select, a.btn, a.glass, .side-link, .hash a";

// The wave outruns the farthest corner, so its crest is still bright when it gets there.
const OVERSHOOT = 1.15;
const REVEAL_MS = 700;

// Runs before paint in the browser, where a new page must not show for a frame before its reveal.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

// The last press, which is where a change it caused spreads from.
let press: { x: number; y: number } | null = null;

const stillMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A select cannot hold children, so its light lives on the label around it.
function hostOf(control: HTMLElement) {
  return control.matches("select") ? control.parentElement ?? control : control;
}

// Light from a press spreads through the glass and catches on the rim as it arrives.
function spread(control: HTMLElement, clientX: number, clientY: number) {
  press = { x: clientX, y: clientY };
  const host = hostOf(control);
  const box = host.getBoundingClientRect();
  // The hit area of a compact control is bigger than the control, so keep the origin on the glass.
  const x = Math.min(Math.max(clientX - box.left, 0), box.width);
  const y = Math.min(Math.max(clientY - box.top, 0), box.height);
  const radius = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y)) * OVERSHOOT;
  const duration = Math.min(760, 400 + radius * 2.4);

  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const layer = document.createElement("span");
  layer.className = "ripple";
  layer.setAttribute("aria-hidden", "true");
  layer.style.setProperty("--ripple-x", `${x}px`);
  layer.style.setProperty("--ripple-y", `${y}px`);
  layer.style.setProperty("--ripple-r", `${radius}px`);
  layer.style.setProperty("--ripple-ms", `${duration}ms`);
  layer.innerHTML = '<i></i><span class="ripple-rim"><i></i></span>';
  host.append(layer);
  setTimeout(() => layer.remove(), duration);
}

function fromEvent(event: Event) {
  const control = (event.target as Element).closest<HTMLElement>(PRESSABLE);
  if (!control || control.matches(":disabled, [aria-disabled='true']")) return null;
  return stillMotion() ? null : control;
}

// Points a reveal at the last press, in the coordinates of the box it is revealing. A press
// outside the box starts from the nearest point on its edge, so no time is lost reaching it.
function aimReveal(target: HTMLElement, box: DOMRect) {
  const x = Math.min(Math.max((press?.x ?? box.left + box.width / 2) - box.left, 0), box.width);
  const y = Math.min(Math.max((press?.y ?? box.top + box.height / 2) - box.top, 0), box.height);
  target.style.setProperty("--reveal-x", `${x}px`);
  target.style.setProperty("--reveal-y", `${y}px`);
  target.style.setProperty("--reveal-to", `${Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y))}px`);
  target.style.setProperty("--reveal-ms", `${REVEAL_MS}ms`);
}

// The browser holds a picture of the old state and the new one spreads over it from the press.
// Anything that did not change is the same in both, so only what changed shows the wave.
export function rippleChange(update: () => void) {
  if (!document.startViewTransition || stillMotion()) {
    update();
    return;
  }
  aimReveal(document.documentElement, new DOMRect(0, 0, window.innerWidth, window.innerHeight));
  document.startViewTransition(() => flushSync(update));
}

// Starts a reveal, restarting it if the last one on this element has not finished.
function reveal(target: HTMLElement, box: DOMRect) {
  aimReveal(target, box);
  delete target.dataset.revealing;
  void target.offsetWidth;
  target.dataset.revealing = "true";
  target.onanimationend = (event) => {
    if (event.target === target && event.animationName === "reveal-spread") delete target.dataset.revealing;
  };
}

// A panel is new content all the way through, so it gets a wave of its own, with the light of
// the press as its crest. Nothing plays without a press, as when a link opens a panel directly.
function rippleIn(panel: HTMLElement) {
  if (!press || stillMotion()) return;
  reveal(panel, panel.getBoundingClientRect());
  spread(panel, press.x, press.y);
}

// Ripples the element in when it first shows, and again whenever key says its content changed.
export function useRippleIn<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  const shown = useRef<unknown>(undefined);
  useBeforePaint(() => {
    // Strict mode runs this twice on mount, which would stack two waves.
    if (!ref.current || shown.current === key) return;
    shown.current = key;
    rippleIn(ref.current);
  }, [key]);
  return ref;
}

export function Ripple() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const control = fromEvent(event);
      if (control) spread(control, event.clientX, event.clientY);
    };
    // Capture, so the press is known before the control's own handler uses it.
    const onClick = (event: MouseEvent) => {
      const control = fromEvent(event);
      // A keyboard click reports no position and no detail, so start from the middle of the control.
      if (control && event.detail === 0) {
        const box = control.getBoundingClientRect();
        spread(control, box.left + box.width / 2, box.top + box.height / 2);
      }
      const details = (event.target as Element).closest("summary")?.parentElement;
      if (details instanceof HTMLDetailsElement) {
        event.preventDefault();
        rippleChange(() => {
          details.open = !details.open;
          if (details.open && details.lastElementChild instanceof HTMLElement) rippleIn(details.lastElementChild);
        });
      }
    };
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // A route can take a while to load, so a new page ripples in once it is here rather than
  // holding the old one on screen. Leaving the landing page is already covered by the flood.
  useBeforePaint(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === pathname || from === "/" || stillMotion()) return;
    const page = document.querySelector<HTMLElement>(".page");
    if (page) reveal(page, page.getBoundingClientRect());
  }, [pathname]);

  return null;
}
