// Stand-in for the bridge from docs/02 section 4, for testing live mode with no agent or chain.
// Streams unnamed SSE `data:` lines, which is what EventSource.onmessage expects. With no arguments
// it plays a baked run. Pass runs/<run_id>/events.jsonl paths to play recorded agent runs instead,
// and /entry/:cid then serves the entries saved beside them.
//
//   node scripts/mock-bridge.mjs [runs/<run_id>/events.jsonl ...]
//   NEXT_PUBLIC_BRIDGE_URL=http://localhost:8787 npm run dev
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";

const baked = JSON.parse(readFileSync(new URL("../mock/baked.json", import.meta.url), "utf8"));
const PORT = Number(process.env.PORT ?? 8787);
const SPEED = Number(process.env.SPEED ?? 8);
const recordings = process.argv.slice(2);

const clients = new Set();
const entries = new Map();

const broadcast = (event) => {
  for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`);
};

async function play(events, run_id) {
  let previous = events[0].ts;
  for (const event of events) {
    await new Promise((resolve) => setTimeout(resolve, Math.min((event.ts - previous) / SPEED, 800)));
    previous = event.ts;
    broadcast({ ...event, run_id, ts: Date.now() });
  }
}

function loadRecording(path) {
  const folder = join(dirname(path), "entries");
  if (existsSync(folder)) {
    for (const name of readdirSync(folder)) {
      const { cid, entry } = JSON.parse(readFileSync(join(folder, name), "utf8"));
      entries.set(cid, entry);
    }
  }
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

async function streamRuns() {
  if (!recordings.length) return play(baked.runs[0].events, `live-${Date.now()}`);
  for (const path of recordings) {
    const events = loadRecording(path);
    await play(events, events[0].run_id);
  }
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/health") return json(res, { ok: true, chainId: 11155111, registry: "mock", pinata: false });
  if (url.pathname.startsWith("/entry/")) {
    const entry = entries.get(decodeURIComponent(url.pathname.slice("/entry/".length)));
    return entry ? json(res, entry) : json(res, { detail: "Not found" }, 404);
  }
  if (url.pathname === "/memory") {
    const task = url.searchParams.get("task");
    return json(res, baked.memory.filter((m) => m.task_signature === task).map(({ entry_id, cid, tier, confidence }) => ({ entry_id, cid, tier, confidence, entry: {} })));
  }
  if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
    res.write(":connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    if (clients.size === 1) streamRuns();
    return;
  }
  res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
  res.end();
}).listen(PORT, () => console.log(`mock bridge on http://localhost:${PORT}`));
