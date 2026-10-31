// Real ripples, no 3D library: a height-field wave simulation on the CPU, whose slopes
// displace the reflected headline in a small shader. Cells are wider than tall so rings
// read as ellipses on a surface seen at a low angle.
const CELL_X = 4;
const CELL_Y = 2;
const DAMPING = 0.991;
const STEP_MS = 1000 / 60;
const MAX_PIXEL_RATIO = 1.5;
const SLOPE_SCALE = 1.4;

export const VERTEX = `
attribute vec2 corner;
varying vec2 v;
void main() {
  v = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 v;
uniform sampler2D source;
uniform sampler2D wave;
uniform sampler2D backdrop;
uniform vec2 cells;
uniform vec3 tint;
uniform float time;
uniform float agitation;
uniform float starlight;
uniform float lift;

// Cubic B-spline in four linear taps. Plain linear filtering shows the grid as creases.
vec2 waveAt(vec2 point) {
  vec2 cell = point * cells - 0.5;
  vec2 whole = floor(cell);
  vec2 f = cell - whole;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 a = (whole - 0.5 + w1 / g0) / cells;
  vec2 b = (whole + 1.5 + w3 / g1) / cells;
  return mix(
    mix(texture2D(wave, b).rg, texture2D(wave, vec2(a.x, b.y)).rg, g0.x),
    mix(texture2D(wave, vec2(b.x, a.y)).rg, texture2D(wave, a).rg, g0.x),
    g0.y);
}

void main() {
  vec2 slope = (waveAt(v) - 0.5) * 2.0;

  // Slow swell, so still water never looks frozen but touches stay the loudest thing on it.
  float swell = sin(v.y * (30.0 + 34.0 * v.y) + time * 0.9 + 2.0 * sin(v.x * 4.0 + time * 0.25));
  swell += 0.35 * sin(v.y * 74.0 - time * 1.3 + 2.0 * sin(v.x * 7.0 - time * 0.18));

  // Long waves rolling in from the horizon, bunched up with distance. Always running.
  float roll = sin(v.y * (22.0 + 40.0 * v.y) - time * 0.7 + 1.5 * sin(v.x * 3.0 + time * 0.2));
  roll += 0.5 * sin(v.y * (48.0 + 60.0 * v.y) - time * 1.1 + 2.0 * sin(v.x * 6.0 - time * 0.3 + 1.7));

  // Scrolling churns the surface: the same swell, much rougher, with a vertical heave.
  vec2 offset = slope * vec2(0.05, 0.16) + vec2(swell * (0.0009 + v.y * 0.0034) * (1.0 + agitation * 9.0), 0.0);
  offset.y += roll * (0.004 + v.y * 0.018);
  offset.y += agitation * 0.016 * sin(v.x * 6.0 + time * 2.0 + v.y * 9.0);
  vec2 floating = v - vec2(0.0, lift);
  float ink = texture2D(source, floating + offset).a;
  ink = max(ink, texture2D(source, floating + offset * 1.6 + vec2(0.0, 0.002)).a * 0.6);

  ink = max(ink, texture2D(backdrop, v + offset).a * 0.8 * starlight);

  // Both fade from nothing at the horizon and at the bottom, so the surface has no edge.
  float horizon = smoothstep(0.0, 0.05, v.y);
  float fade = pow(1.0 - v.y, 1.5) * smoothstep(0.0, 0.012, v.y);
  // Faces tilted toward the horizon catch its light, so rings show on empty water too.
  float glint = pow(clamp(-slope.y * 1.5, 0.0, 1.0), 1.5) * 0.5 * horizon * pow(1.0 - v.y, 0.7);
  float sheen = agitation * 0.15 * pow(0.5 + 0.37 * swell, 4.0) * horizon * (1.0 - v.y);
  // Faint bands of horizon light riding the waves, broken up so they never read as stripes.
  float band = pow(0.5 + roll / 3.0, 3.0) * (0.6 + 0.4 * sin(v.x * 9.0 + v.y * 20.0 + time * 0.35));
  float drift = 0.04 * band * smoothstep(0.0, 0.25, v.y) * (1.0 - v.y);

  // A few long crests rolling in toward the viewer, closer together with distance.
  float rolling = pow(v.y, 0.55) * 34.0 - time * 0.7 + 1.6 * sin(v.x * 5.0 + time * 0.2) + 0.6 * sin(v.x * 13.0 - time * 0.3);
  float wave = pow(0.5 + 0.5 * sin(rolling), 16.0) * (0.55 + 0.45 * sin(v.x * 7.0 + v.y * 9.0 + time * 0.3));
  wave *= smoothstep(0.02, 0.14, v.y) * pow(1.0 - v.y, 0.8);

  // A path of light under the horizon glow, glittering wherever a wave faces the viewer.
  vec2 facet = vec2(v.x * 74.0 + roll * 0.6, pow(v.y, 0.6) * 58.0 - time * 0.25);
  vec2 inside = abs(fract(facet) - 0.5);
  float seed = fract(sin(dot(floor(facet), vec2(12.9898, 78.233))) * 43758.5453);
  float flash = pow(0.5 + 0.5 * sin(time * (1.2 + seed * 3.5) + seed * 40.0), 10.0) * step(0.55, seed);
  float path = exp(-pow((v.x - 0.5) * (2.2 + v.y * 2.0), 2.0));
  float glitter = flash * path * horizon * (1.0 - v.y) * smoothstep(0.5, 0.1, inside.y) * smoothstep(0.5, 0.25, inside.x);

  // The waterline itself: a thread of light that never stops moving, rocked by passing ripples.
  float pixel = 1.0 / (cells.y * ${CELL_Y.toFixed(1)});
  float crest = sin(v.x * 11.0 + time * 0.9 + 1.5 * sin(v.x * 3.0 - time * 0.3));
  crest += 0.5 * sin(v.x * 27.0 - time * 1.4) + 0.25 * sin(v.x * 53.0 + time * 1.9);
  float lineY = pixel * (7.0 + crest * 2.5 * (1.0 + agitation * 0.8)) - slope.y * pixel * 12.0;
  float thread = 1.0 - smoothstep(0.4 * pixel, 1.4 * pixel, abs(v.y - lineY));
  thread *= smoothstep(0.0, 0.5, 1.0 - abs(v.x * 2.0 - 1.0)) * (0.7 + 0.3 * sin(v.x * 8.0 - time * 0.6));

  float light = min(ink * fade * 0.46 + glint + sheen + drift + thread * 0.42 + glitter * 0.34 + wave * 0.075, 0.5);

  gl_FragColor = vec4(tint * light, light);
}`;

export interface Water {
  poke: (clientX: number, clientY: number, strength?: number, radius?: number) => void;
  redraw: () => void;
  splash: () => void;
  repaint: () => void;
  setLift: (pixels: number) => void;
  stir: (energy: number, direction: number) => void;
  setLight: (color: [number, number, number], stars: number) => void;
  destroy: () => void;
}

export function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function texture(gl: WebGLRenderingContext, unit: number) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

// `paint` draws the mirrored source in CSS pixels, with the origin at the mirror line.
export function createWater(
  canvas: HTMLCanvasElement,
  paint: (context: CanvasRenderingContext2D, box: DOMRect) => void,
  tint: [number, number, number],
  // Anything else on the surface, drawn in the same coordinates but not tied to the headline.
  backdrop?: (context: CanvasRenderingContext2D, box: DOMRect) => void,
): Water | null {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, "corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

  texture(gl, 0);
  texture(gl, 1);
  texture(gl, 2);
  gl.uniform1i(gl.getUniformLocation(program, "source"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "wave"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "backdrop"), 2);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const time = gl.getUniformLocation(program, "time");
  const agitation = gl.getUniformLocation(program, "agitation");
  const cells = gl.getUniformLocation(program, "cells");
  const tintAt = gl.getUniformLocation(program, "tint");
  const starlight = gl.getUniformLocation(program, "starlight");
  const liftAt = gl.getUniformLocation(program, "lift");
  gl.uniform3fv(tintAt, tint);
  gl.uniform1f(starlight, 1);

  const sourceCanvas = document.createElement("canvas");
  const sourceContext = sourceCanvas.getContext("2d");
  const backdropCanvas = document.createElement("canvas");
  const backdropContext = backdropCanvas.getContext("2d");
  if (!sourceContext || !backdropContext) return null;

  let columns = 0;
  let rows = 0;
  let current = new Float32Array(0);
  let previous = new Float32Array(0);
  let surface = new Float32Array(0);
  let pixels = new Uint8Array(0);

  // Just the headlines, cheap enough to run on every frame of a scroll.
  const repaint = () => {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    paint(sourceContext, box);
    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
  };

  const redraw = () => {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    sourceCanvas.width = canvas.width = Math.round(box.width * ratio);
    sourceCanvas.height = canvas.height = Math.round(box.height * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    sourceContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    repaint();
    backdropCanvas.width = canvas.width;
    backdropCanvas.height = canvas.height;
    backdropContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    backdrop?.(backdropContext, box);
    gl.activeTexture(gl.TEXTURE2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backdropCanvas);
  };

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const nextColumns = Math.ceil(box.width / CELL_X);
    const nextRows = Math.ceil(box.height / CELL_Y);
    if (nextColumns !== columns || nextRows !== rows) {
      columns = nextColumns;
      rows = nextRows;
      current = new Float32Array(columns * rows);
      previous = new Float32Array(columns * rows);
      surface = new Float32Array(columns * rows);
      gl.uniform2f(cells, columns, rows);
      // 128 decodes to a flat surface. Left at zero the edges read as steep slopes and glow.
      pixels = new Uint8Array(columns * rows * 4).fill(128);
    }
    redraw();
  };

  const step = () => {
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < columns - 1; x++) {
        const i = y * columns + x;
        const next = (current[i - 1] + current[i + 1] + current[i - columns] + current[i + columns]) / 2 - previous[i];
        previous[i] = next * DAMPING;
      }
    }
    [current, previous] = [previous, current];
  };

  // `blend` is how far this frame sits between the last two steps, so the motion stays even
  // when a display frame lands on none or two of them.
  const uploadWave = (blend: number) => {
    for (let i = 0; i < surface.length; i++) surface[i] = previous[i] + (current[i] - previous[i]) * blend;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < columns - 1; x++) {
        const i = y * columns + x;
        const p = i * 4;
        pixels[p] = Math.max(0, Math.min(255, 127.5 + (surface[i + 1] - surface[i - 1]) * SLOPE_SCALE * 127.5));
        pixels[p + 1] = Math.max(0, Math.min(255, 127.5 + (surface[i + columns] - surface[i - columns]) * SLOPE_SCALE * 127.5));
        pixels[p + 3] = 255;
      }
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, columns, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  };

  const drop = (column: number, row: number, strength: number, radius: number) => {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius * 2; x <= radius * 2; x++) {
        const c = column + x;
        const r = row + y;
        if (c < 1 || r < 1 || c >= columns - 1 || r >= rows - 1) continue;
        const distance = Math.hypot(x / 2, y) / radius;
        if (distance <= 1) current[r * columns + c] -= strength * (1 + Math.cos(distance * Math.PI)) * 0.5;
      }
    }
  };

  const poke: Water["poke"] = (clientX, clientY, strength = 0.5, radius = 5) => {
    const box = canvas.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    if (x < 0 || y < 0 || x > box.width || y > box.height) return;
    drop(Math.floor(x / CELL_X), Math.floor(y / CELL_Y), strength, radius);
  };

  // A row of drops along the shore, for when something breaks the surface.
  const splash = () => {
    for (let i = 0; i < 6; i++) drop(Math.floor(columns * (0.1 + i * 0.16)), 6 + (i % 2) * 3, 0.32, 5);
  };

  let flow = 0;

  // Energy 0 to 1 from scroll speed. Pushes the swell along and breaks up the surface.
  const stir = (energy: number, direction: number) => {
    flow += energy * direction * 0.16;
    gl.uniform1f(agitation, energy);
    if (energy < 0.04) return;
    for (let i = 0; i < Math.ceil(energy * 4); i++) {
      drop(Math.floor(Math.random() * columns), 2 + Math.floor(Math.random() * rows * 0.4), 0.07 + energy * 0.26, 4 + Math.round(energy * 3));
    }
  };

  let frame = 0;
  let last = 0;
  let debt = 0;
  let nextRain = 0;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    debt = Math.min(debt + (now - last), STEP_MS * 2);
    last = now;
    // Stray drops keep it alive when nobody is touching it, as on a projector.
    if (now > nextRain) {
      nextRain = now + 700 + Math.random() * 1500;
      drop(Math.floor(Math.random() * columns), Math.floor(rows * (0.15 + Math.random() * 0.6)), 0.22, 5);
    }
    while (debt >= STEP_MS) {
      step();
      debt -= STEP_MS;
    }
    uploadWave(Math.max(debt, 0) / STEP_MS);
    gl.uniform1f(time, now / 1000 + flow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const start = () => {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  // No work while the hero is scrolled away or the tab is hidden.
  const visibility = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
  visibility.observe(canvas);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibility);
  const sizing = new ResizeObserver(resize);
  sizing.observe(canvas);

  resize();

  return {
    poke,
    redraw,
    splash,
    repaint,
    setLift: (pixels) => gl.uniform1f(liftAt, pixels / Math.max(canvas.height / Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO), 1)),
    stir,
    setLight: (color, stars) => {
      gl.uniform3fv(tintAt, color);
      gl.uniform1f(starlight, stars);
    },
    destroy: () => {
      stop();
      visibility.disconnect();
      sizing.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
