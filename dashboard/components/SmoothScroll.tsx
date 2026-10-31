"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

// Landing only. App screens have panels and a pannable canvas that need native scrolling.
export function SmoothScroll() {
  return <ReactLenis root options={{ lerp: 0.12, wheelMultiplier: 1.25, touchMultiplier: 1.4, anchors: true }} />;
}
