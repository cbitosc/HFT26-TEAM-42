// The page transition: water spreads from the click until it covers the screen, the route
// changes underneath, then it drains from the same point to reveal the next page.
import type { FloodTone } from "./palettes";

const FILL_MS = 950;
const DRAIN_MS = 900;
const EDGE_MARGIN = 160;

const VERTEX = `
attribute vec2 corner;
varying vec2 v;
void main() {
  v = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 v;
uniform vec2 size;
uniform vec2 origin;
uniform float front;
uniform float drained;
uniform float time;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 ring;
uniform vec3 foam;

void main() {
  vec2 p = v * size - origin;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float wobble = 15.0 * sin(angle * 7.0 + time * 3.2) + 9.0 * sin(angle * 13.0 - time * 4.1);

  float edge = front + wobble;
  float cover = 1.0 - smoothstep(edge - 24.0, edge + 2.0, r);
  float hole = drained + wobble;
  float remains = drained > 0.0 ? smoothstep(hole - 30.0, hole + 34.0, r) : 1.0;
  float alpha = cover * remains;

  // Warping the distance keeps the rings from looking drawn: real ones wander and break up.
  float warp = 11.0 * sin(p.x * 0.013 + time * 1.1) + 11.0 * sin(p.y * 0.017 - time * 0.9) + 6.0 * sin((p.x + p.y) * 0.031 + time * 1.7);
  float q = r + warp;
  float rings = pow(max(sin(q * 0.04 - time * 12.0), 0.0), 4.0) * (0.5 + 0.5 * sin(q * 0.0115 - time * 3.1));
  rings += 0.5 * pow(max(sin(q * 0.083 - time * 17.0 + warp * 0.05), 0.0), 7.0);
  rings *= exp(-r * 0.0011);

  // Each moving edge catches the light.
  float crest = exp(-pow((r - edge) / 46.0, 2.0)) + exp(-pow((r - hole) / 58.0, 2.0)) * step(0.001, drained);
  float depth = 0.5 + 0.5 * sin(v.y * 3.0 + warp * 0.03 + time * 0.6);

  vec3 water = mix(deep, shallow, depth * 0.85);
  vec3 color = water + ring * rings * 0.6 + foam * crest * 0.5;
  gl_FragColor = vec4(color * alpha, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

// Returns false if WebGL is unavailable, so the caller can navigate plainly instead.
export function playFlood(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  onCovered: () => Promise<void>,
  onDone: () => void,
  tone: FloodTone,
) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return false;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return false;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, "corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

  const width = (canvas.width = window.innerWidth);
  const height = (canvas.height = window.innerHeight);
  gl.viewport(0, 0, width, height);
  gl.uniform2f(gl.getUniformLocation(program, "size"), width, height);
  gl.uniform2f(gl.getUniformLocation(program, "origin"), x, height - y);
  gl.uniform3fv(gl.getUniformLocation(program, "deep"), tone.deep);
  gl.uniform3fv(gl.getUniformLocation(program, "shallow"), tone.shallow);
  gl.uniform3fv(gl.getUniformLocation(program, "ring"), tone.ring);
  gl.uniform3fv(gl.getUniformLocation(program, "foam"), tone.crest);
  const front = gl.getUniformLocation(program, "front");
  const drained = gl.getUniformLocation(program, "drained");
  const time = gl.getUniformLocation(program, "time");

  const reach = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + EDGE_MARGIN;
  const started = performance.now();
  let phase: "fill" | "hold" | "drain" = "fill";
  let drainStart = 0;

  const draw = (now: number) => {
    const elapsed = now - started;
    let radius = reach;
    let cleared = 0;

    if (phase === "fill") {
      const t = Math.min(elapsed / FILL_MS, 1);
      radius = reach * easeIn(t);
      if (t >= 1) {
        phase = "hold";
        onCovered().then(() => {
          phase = "drain";
          drainStart = performance.now();
        });
      }
    } else if (phase === "drain") {
      const t = Math.min((now - drainStart) / DRAIN_MS, 1);
      cleared = Math.max(reach * easeOut(t), 1);
      if (t >= 1) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        onDone();
        return;
      }
    }

    gl.uniform1f(front, radius);
    gl.uniform1f(drained, cleared);
    gl.uniform1f(time, elapsed / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
  return true;
}
