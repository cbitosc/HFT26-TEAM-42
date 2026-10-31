import { useEffect, useState } from "react";
import type { Finding } from "./baked";
import { BRIDGE_URL, fetchEntry, type EntryBlob } from "./bridge";

export type EntryLoad = { status: "none" | "loading" | "failed" } | { status: "loaded"; entry: EntryBlob };

// Enriches the inspector from /entry/:cid. The bridge may be absent, and the gateway may be slow.
export function useEntry(cid: string | undefined): EntryLoad {
  const [load, setLoad] = useState<EntryLoad>({ status: "none" });

  useEffect(() => {
    if (!cid || !BRIDGE_URL) {
      setLoad({ status: "none" });
      return;
    }
    let current = true;
    setLoad({ status: "loading" });
    fetchEntry(cid).then(
      (entry) => current && setLoad({ status: "loaded", entry }),
      () => current && setLoad({ status: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [cid]);

  return load;
}

export const findingsOf = (load: EntryLoad): Finding[] | undefined =>
  load.status === "loaded" ? load.entry.critique?.findings : undefined;
