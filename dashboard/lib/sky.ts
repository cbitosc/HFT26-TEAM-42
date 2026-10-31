// The night behind the hero. Everything is seeded, so the sky is the same on every load and the
// water can reflect exactly the stars above it.
const STAR_COUNT = 280;
const TWINKLE_EVERY = 6;

export interface Star {
  x: number;
  // Height above the horizon, 0 to 1 of the sky.
  rise: number;
  size: number;
  light: number;
  twinkles: boolean;
}

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(26);

export const STARS: Star[] = Array.from({ length: STAR_COUNT }, (_, i) => {
  const rise = random() ** 0.7;
  // Most are faint, a few are bright, and all of them drown in the haze at the horizon.
  const brightness = 0.25 + random() ** 3 * 0.75;
  return {
    x: random(),
    rise,
    size: 0.5 + random() ** 4 * 1.1,
    light: brightness * Math.min(rise / 0.22, 1),
    twinkles: i % TWINKLE_EVERY === 0,
  };
});

// `rise` runs up the sky above the canvas's waterline, or down the water when `direction` is 1.
export function paintStars(
  context: CanvasRenderingContext2D,
  width: number,
  horizon: number,
  height: number,
  direction: 1 | -1,
  stars: Star[] = STARS,
) {
  context.fillStyle = "#fff";
  for (const star of stars) {
    context.globalAlpha = star.light;
    context.beginPath();
    context.arc(star.x * width, horizon + direction * star.rise * height, star.size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

// Long thin streaks that repeat every half width, so the canvas can slide forever without a seam.
export function paintClouds(context: CanvasRenderingContext2D, width: number, horizon: number) {
  const cloudRandom = seeded(61);
  const tile = width / 2;
  for (let i = 0; i < 16; i++) {
    const x = cloudRandom() * tile;
    const y = horizon * (0.42 + cloudRandom() * 0.5);
    const reach = tile * (0.1 + cloudRandom() * 0.2);
    const light = 0.3 + cloudRandom() * 0.7;
    for (const start of [x - tile, x, x + tile]) {
      context.save();
      context.translate(start, y);
      context.scale(1, 0.05);
      const glow = context.createRadialGradient(0, 0, 0, 0, 0, reach);
      glow.addColorStop(0, `rgb(255 255 255 / ${light})`);
      glow.addColorStop(1, "rgb(255 255 255 / 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, reach, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }
}

// A far shoreline from a few sines, in the 0 to 1 range.
const ridgeAt = (x: number, phase: number) =>
  0.5 + 0.28 * Math.sin(x * 5.1 + phase) + 0.15 * Math.sin(x * 13.7 + phase * 2.3) + 0.07 * Math.sin(x * 31 + phase * 3.1);

// Mirrored about the horizon. The reflection is fainter, because water takes some of the light.
export function paintRidge(context: CanvasRenderingContext2D, width: number, horizon: number, height: number, color: string, phase: number) {
  for (const [direction, alpha] of [
    [-1, 1],
    [1, 0.5],
  ]) {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, horizon);
    for (let x = 0; x <= width + 6; x += 6) context.lineTo(x, horizon + direction * ridgeAt(x / width, phase) * height);
    context.lineTo(width, horizon);
    context.closePath();
    context.fill();
  }
  context.globalAlpha = 1;
}
