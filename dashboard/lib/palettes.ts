// The hero's colours: sky, the glass word and the light on the water. CSS and the canvases
// read from here, so they can't drift apart. Nothing is green, because mint means verified.
export interface Palette {
  id: string;
  name: string;
  note: string;
  // Top of the sky, partway down, and the horizon.
  sky: [string, string, string];
  word: string;
  glass: string[];
  glow: string;
  // Multiplies the reflection and the glints, 0 to 1 per channel.
  water: [number, number, number];
}

type Channels = [number, number, number];

export interface FloodTone {
  deep: Channels;
  shallow: Channels;
  ring: Channels;
  crest: Channels;
}

const fromHex = (hex: string): Channels => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Channels;
const fromRgb = (rgb: string): Channels => (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n) / 255) as Channels;

// The page transition is the same water as the hero, so it takes the same colours.
export const floodTone = (palette: Palette): FloodTone => ({
  deep: fromHex(palette.sky[0]),
  shallow: fromHex(palette.sky[2]),
  ring: fromRgb(palette.glow),
  crest: palette.water,
});

export function paletteStyle(palette: Palette) {
  const style: Record<string, string> = {
    "--sky-0": palette.sky[0],
    "--sky-1": palette.sky[1],
    "--sky-2": palette.sky[2],
    "--word": palette.word,
    "--glass-glow": palette.glow,
  };
  palette.glass.forEach((color, i) => {
    style[`--glass-${i}`] = color;
  });
  return style as React.CSSProperties;
}
