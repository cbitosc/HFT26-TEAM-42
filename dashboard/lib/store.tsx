"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { bakedRun, bakedRuns } from "./baked";
import { BRIDGE_URL } from "./bridge";
import type { RunEvent } from "./events";
import { applyEvent, emptyRun, type RunState } from "./runState";

export type Source = "live" | "replay" | "baked";
export type LiveStatus = "off" | "connecting" | "on" | "lost";

interface Playback {
  runId: string | null;
  playing: boolean;
  speed: number;
  position: number;
  length: number;
}

interface Store {
  runs: Record<string, RunState>;
  runIds: string[];
  playback: Playback;
  live: LiveStatus;
  liveRuns: string[];
  lastEventAt: number | null;
  bridgeConfigured: boolean;
  activeRunId: string;
  setActiveRunId: (id: string) => void;
  restart: (id: string) => void;
  pause: () => void;
  resume: () => void;
  setSpeed: (speed: number) => void;
  connectLive: () => void;
  disconnectLive: () => void;
  sourceOf: (id: string) => Source;
  offChain: (id: string) => boolean;
}

type Action = { type: "event"; event: RunEvent } | { type: "reset"; id: string };

const finished = (id: string, events: RunEvent[]) => events.reduce(applyEvent, emptyRun(id));

const initialRuns = () => Object.fromEntries(bakedRuns.map((run) => [run.id, finished(run.id, run.events)]));

function reducer(runs: Record<string, RunState>, action: Action) {
  if (action.type === "reset") return { ...runs, [action.id]: emptyRun(action.id) };
  const id = action.event.run_id;
  return { ...runs, [id]: applyEvent(runs[id] ?? emptyRun(id), action.event) };
}

const MAX_GAP_MS = 1400;

const Context = createContext<Store | null>(null);

export function RunsProvider({ children }: { children: React.ReactNode }) {
  const [runs, dispatch] = useReducer(reducer, undefined, initialRuns);
  const [playback, setPlayback] = useState<Playback>({ runId: null, playing: false, speed: 4, position: 0, length: 0 });
  const [activeRunId, setActiveRunId] = useState(bakedRuns[0].id);
  const [live, setLive] = useState<LiveStatus>("off");
  const [liveRuns, setLiveRuns] = useState<string[]>([]);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cursor = useRef({ runId: null as string | null, index: 0, speed: 4 });
  const source = useRef<EventSource | null>(null);
  const mounted = useRef(true);

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  };

  const step = useCallback(() => {
    const { runId, index, speed } = cursor.current;
    const events = runId ? bakedRun(runId)?.events : undefined;
    timer.current = undefined;
    if (!mounted.current || !events || index >= events.length) return;
    dispatch({ type: "event", event: events[index] });
    cursor.current.index = index + 1;
    const next = events[index + 1];
    setPlayback((p) => ({ ...p, position: index + 1, playing: Boolean(next) }));
    if (next) {
      const gap = Math.min((next.ts - events[index].ts) / speed, MAX_GAP_MS);
      timer.current = setTimeout(step, gap);
    }
  }, []);

  const restart = useCallback(
    (id: string) => {
      const run = bakedRun(id);
      if (!run) return;
      stopTimer();
      dispatch({ type: "reset", id });
      cursor.current = { ...cursor.current, runId: id, index: 0 };
      setPlayback((p) => ({ ...p, runId: id, playing: true, position: 0, length: run.events.length }));
      timer.current = setTimeout(step, 300);
    },
    [step],
  );

  const pause = useCallback(() => {
    stopTimer();
    setPlayback((p) => ({ ...p, playing: false }));
  }, []);

  const resume = useCallback(() => {
    const { runId, index } = cursor.current;
    const events = runId ? bakedRun(runId)?.events : undefined;
    if (!events || index >= events.length || timer.current) return;
    setPlayback((p) => ({ ...p, playing: true }));
    step();
  }, [step]);

  const setSpeed = useCallback((speed: number) => {
    cursor.current.speed = speed;
    setPlayback((p) => ({ ...p, speed }));
  }, []);

  const disconnectLive = useCallback(() => {
    source.current?.close();
    source.current = null;
    setLive("off");
  }, []);

  const connectLive = useCallback(() => {
    if (!BRIDGE_URL || source.current) return;
    setLive("connecting");
    const stream = new EventSource(`${BRIDGE_URL}/events`);
    source.current = stream;
    stream.onopen = () => setLive("on");
    // EventSource reconnects by itself, and the bridge then resends its history. The reducer tolerates that.
    stream.onerror = () => setLive("lost");
    stream.onmessage = (message) => {
      let event: RunEvent;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!event.run_id) return;
      setLive("on");
      setLastEventAt(Date.now());
      setLiveRuns((ids) => (ids.includes(event.run_id) ? ids : [...ids, event.run_id]));
      dispatch({ type: "event", event });
    };
  }, []);

  // A flag, not clearTimeout: a replay can start during this same mount, and Strict Mode's
  // simulated unmount would otherwise cancel it.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      source.current?.close();
      source.current = null;
    };
  }, []);

  const sourceOf = useCallback(
    (id: string): Source => {
      // Offline agent runs reach us over the same stream, and their hashes are not real.
      if (liveRuns.includes(id)) return runs[id]?.baked ? "baked" : "live";
      return bakedRun(id)?.provenance === "replay" ? "replay" : "baked";
    },
    [liveRuns, runs],
  );

  // True when a run has no real transaction behind it, whatever its badge says.
  const offChain = useCallback((id: string) => sourceOf(id) === "baked" || Boolean(runs[id]?.baked), [sourceOf, runs]);

  const value = useMemo<Store>(
    () => ({
      runs,
      runIds: [...liveRuns, ...bakedRuns.map((run) => run.id)],
      playback,
      live,
      liveRuns,
      lastEventAt,
      bridgeConfigured: Boolean(BRIDGE_URL),
      activeRunId,
      setActiveRunId,
      restart,
      pause,
      resume,
      setSpeed,
      connectLive,
      disconnectLive,
      sourceOf,
      offChain,
    }),
    [runs, liveRuns, lastEventAt, playback, live, activeRunId, restart, pause, resume, setSpeed, connectLive, disconnectLive, sourceOf, offChain],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRuns() {
  const store = useContext(Context);
  if (!store) throw new Error("useRuns must be used inside RunsProvider");
  return store;
}

// Syncs the dock with the route, and honours ?play=1 from the landing page exactly once.
export function useRunRoute(runId: string) {
  const store = useRuns();
  const { setActiveRunId, restart } = store;
  useEffect(() => {
    setActiveRunId(runId);
    const url = new URL(window.location.href);
    if (url.searchParams.has("play")) {
      url.searchParams.delete("play");
      window.history.replaceState(null, "", url.pathname);
      restart(runId);
    }
  }, [runId, setActiveRunId, restart]);
  return store.runs[runId];
}
