"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { playFlood } from "@/lib/flood";
import { DAYBREAK } from "@/lib/daybreak";
import { floodTone, type Palette } from "@/lib/palettes";

// How long the new page gets to paint under the water, and the most we wait for the route.
const SETTLE_MS = 140;
const ROUTE_TIMEOUT_MS = 2500;

type Flood = (href: string, x: number, y: number) => void;

const Context = createContext<Flood | null>(null);
const ToneContext = createContext<React.MutableRefObject<Palette> | null>(null);

// The screen that starts the transition names its colours. Links anywhere inside it then use them.
export function useFloodPalette(palette: Palette) {
  const tone = useContext(ToneContext);
  useEffect(() => {
    if (tone) tone.current = palette;
  }, [tone, palette]);
}

// Lives in the root layout: the canvas has to survive the route change it is covering.
export function FloodProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const canvas = useRef<HTMLCanvasElement>(null);
  const arrived = useRef<(() => void) | null>(null);
  const tone = useRef<Palette>(DAYBREAK[0].palette);
  const [active, setActive] = useState(false);

  useEffect(() => {
    arrived.current?.();
    arrived.current = null;
  }, [pathname]);

  const flood = useCallback<Flood>(
    (href, x, y) => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || !canvas.current) {
        router.push(href);
        return;
      }
      setActive(true);
      const played = playFlood(
        canvas.current,
        x,
        y,
        () =>
          new Promise((resolve) => {
            const settle = () => setTimeout(resolve, SETTLE_MS);
            arrived.current = settle;
            setTimeout(settle, ROUTE_TIMEOUT_MS);
            router.push(href);
          }),
        () => setActive(false),
        floodTone(tone.current),
      );
      if (!played) {
        setActive(false);
        router.push(href);
      }
    },
    [router],
  );

  return (
    <Context.Provider value={flood}>
      <ToneContext.Provider value={tone}>{children}</ToneContext.Provider>
      <canvas ref={canvas} className="flood" data-active={active} aria-hidden="true" />
    </Context.Provider>
  );
}

export function FloodLink({
  href,
  onClick,
  ...props
}: React.ComponentProps<typeof Link> & { href: string }) {
  const flood = useContext(Context);
  return (
    <Link
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        // Leave new-tab and modified clicks to the browser.
        if (!flood || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        // A keyboard click reports 0,0, so start from the middle of the link instead.
        flood(href, event.clientX || box.left + box.width / 2, event.clientY || box.top + box.height / 2);
      }}
    />
  );
}
