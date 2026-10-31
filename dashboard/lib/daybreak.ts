// The whole story as one night: scrolling runs the scene from dusk to dawn. Every colour blends
// between these keys, so the shift never steps. Nothing is green, because mint means verified.
import type { Palette } from "./palettes";

interface Key {
  at: number;
  // How much of the starlight is showing, 0 to 1.
  stars: number;
  palette: Palette;
}

export const DAYBREAK: Key[] = [
  {
    at: 0,
    stars: 0.25,
    palette: {
      id: "daybreak",
      name: "Dusk to Dawn",
      note: "One night, from first scroll to last",
      sky: ["#0d0a18", "#2a1730", "#7a2f45"],
      word: "#d1bcc9",
      glass: ["#ffffff", "rgb(255 205 214 / 0.95)", "rgb(206 92 134 / 0.9)", "rgb(240 140 150 / 0.9)", "#ffffff", "rgb(250 180 190 / 0.9)"],
      glow: "rgb(255 130 120 / 0.42)",
      water: [1, 0.78, 0.76],
    },
  },
  {
    at: 0.42,
    stars: 1,
    palette: {
      id: "night",
      name: "Night",
      note: "",
      sky: ["#05060e", "#0a0e1e", "#18213c"],
      word: "#aab4c8",
      glass: ["#ffffff", "rgb(190 210 250 / 0.95)", "rgb(84 120 205 / 0.88)", "rgb(120 156 236 / 0.9)", "#ffffff", "rgb(150 180 240 / 0.9)"],
      glow: "rgb(120 150 240 / 0.3)",
      water: [0.78, 0.85, 1],
    },
  },
  {
    at: 0.72,
    stars: 0.55,
    palette: {
      id: "first-light",
      name: "First light",
      note: "",
      sky: ["#0b0f22", "#231f42", "#6a3f66"],
      word: "#c8bccc",
      glass: ["#ffffff", "rgb(240 205 225 / 0.95)", "rgb(170 100 170 / 0.9)", "rgb(220 140 170 / 0.9)", "#ffffff", "rgb(235 180 200 / 0.9)"],
      glow: "rgb(240 130 150 / 0.38)",
      water: [0.95, 0.8, 0.85],
    },
  },
  {
    at: 1,
    stars: 0,
    palette: {
      id: "dawn",
      name: "Dawn",
      note: "",
      sky: ["#16203c", "#5b4168", "#d0744a"],
      word: "#e6d6c8",
      glass: ["#fff7e6", "rgb(255 214 140 / 0.95)", "rgb(214 120 48 / 0.9)", "rgb(244 164 84 / 0.9)", "#fff1d6", "rgb(250 190 110 / 0.9)"],
      glow: "rgb(255 180 110 / 0.5)",
      water: [1, 0.84, 0.62],
    },
  },
];

function channels(color: string) {
  if (color[0] === "#") {
    const hex = parseInt(color.slice(1), 16);
    return [hex >> 16, (hex >> 8) & 255, hex & 255, 1];
  }
  const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b, a];
}

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

function blend(from: string, to: string, amount: number) {
  const a = channels(from);
  const b = channels(to);
  const [r, g, bl] = [0, 1, 2].map((i) => Math.round(lerp(a[i], b[i], amount)));
  return `rgb(${r} ${g} ${bl} / ${lerp(a[3], b[3], amount).toFixed(3)})`;
}

export function daybreakAt(day: number) {
  const next = Math.max(DAYBREAK.findIndex((key) => key.at >= day), 1);
  const from = DAYBREAK[next - 1];
  const to = DAYBREAK[next];
  const amount = clamp((day - from.at) / (to.at - from.at));
  const sky = from.palette.sky.map((color, i) => blend(color, to.palette.sky[i], amount));

  const vars: Record<string, string> = {
    "--sky-0": sky[0],
    "--sky-1": sky[1],
    "--sky-2": sky[2],
    "--word": blend(from.palette.word, to.palette.word, amount),
    "--glass-glow": blend(from.palette.glow, to.palette.glow, amount),
    "--stars": lerp(from.stars, to.stars, amount).toFixed(3),
  };
  from.palette.glass.forEach((color, i) => {
    vars[`--glass-${i}`] = blend(color, to.palette.glass[i], amount);
  });

  return {
    vars,
    sky,
    stars: lerp(from.stars, to.stars, amount),
    tint: from.palette.water.map((value, i) => lerp(value, to.palette.water[i], amount)) as [number, number, number],
  };
}
