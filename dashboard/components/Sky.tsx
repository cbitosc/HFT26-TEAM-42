"use client";

import { useEffect, useRef } from "react";
import type { Palette } from "@/lib/palettes";
import { paintClouds, paintRidge, paintStars, STARS } from "@/lib/sky";

const MAX_PIXEL_RATIO = 2;
const FAR_RIDGE = 0.075;
const NEAR_RIDGE = 0.04;

export type PaintRidges = (far: string, near: string) => void;

// Painted once per size. The stars that twinkle sit on their own canvas, so only its opacity
// animates, and the ridges sit on theirs so a changing sky can recolour them through `ridges`.
export function Sky({
  palette,
  ridges,
  moon,
}: {
  palette: Palette;
  ridges?: React.MutableRefObject<PaintRidges | null>;
  moon?: React.RefObject<HTMLDivElement>;
}) {
  const still = useRef<HTMLCanvasElement>(null);
  const twinkling = useRef<HTMLCanvasElement>(null);
  const shore = useRef<HTMLCanvasElement>(null);
  const clouds = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let colors = [palette.sky[1], palette.sky[0]];

    const paintShore = () => {
      const canvas = shore.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const { width, height } = canvas.getBoundingClientRect();
      const horizon = (height * parseFloat(getComputedStyle(canvas).getPropertyValue("--mirror"))) / 100;
      context.clearRect(0, 0, width, height);
      paintRidge(context, width, horizon, height * FAR_RIDGE, colors[0], 1.2);
      paintRidge(context, width, horizon, height * NEAR_RIDGE, colors[1], 4.4);
    };

    const paint = () => {
      const canvas = still.current;
      const context = canvas?.getContext("2d");
      const twinkle = twinkling.current?.getContext("2d");
      const shoreline = shore.current?.getContext("2d");
      if (!canvas || !context || !twinkle || !shoreline) return;
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const horizon = (height * parseFloat(getComputedStyle(canvas).getPropertyValue("--mirror"))) / 100;
      for (const target of [context, twinkle, shoreline]) {
        target.canvas.width = Math.round(width * ratio);
        target.canvas.height = Math.round(height * ratio);
        target.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      paintStars(context, width, horizon, horizon, -1, STARS.filter((star) => !star.twinkles));
      paintStars(twinkle, width, horizon, horizon, -1, STARS.filter((star) => star.twinkles));
      paintShore();
      const cloudLayer = clouds.current?.getContext("2d");
      if (!cloudLayer) return;
      cloudLayer.canvas.width = Math.round(width * 2);
      cloudLayer.canvas.height = Math.round(height);
      paintClouds(cloudLayer, width * 2, horizon);
    };

    paint();
    if (ridges) {
      ridges.current = (far, near) => {
        colors = [far, near];
        paintShore();
      };
    }
    const sizing = new ResizeObserver(paint);
    if (still.current) sizing.observe(still.current);
    return () => {
      sizing.disconnect();
      if (ridges) ridges.current = null;
    };
  }, [palette, ridges]);

  return (
    <div className="sky" aria-hidden="true">
      <div className="stars">
        <canvas ref={still} />
        <canvas ref={twinkling} data-twinkle />
        <i className="meteor" />
        <i className="meteor" />
        <i className="meteor" />
      </div>
      {moon ? <div ref={moon} className="moon" /> : null}
      <canvas ref={clouds} className="clouds" />
      <canvas ref={shore} />
    </div>
  );
}
