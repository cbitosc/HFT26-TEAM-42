"use client";

import { useEffect, useState } from "react";
import { bakedChain, bakedMemory } from "@/lib/baked";
import { REGISTRY_ADDRESS, chainConfigured, etherscanAddress, fetchChainSummary, type ChainSummary } from "@/lib/chain";
import { formatEth, truncateHash } from "@/lib/format";
import { useRuns } from "@/lib/store";

const REFRESH_MS = 30000;
const BRIDGE = { on: "Bridge connected", connecting: "Bridge connecting", lost: "Bridge reconnecting", off: "Bridge off" };

// Facts that hold on every screen. Anything it cannot read falls back to the labelled snapshot.
export function StatusStrip() {
  const { live, lastEventAt, bridgeConfigured } = useRuns();
  const [chain, setChain] = useState<ChainSummary | null>(null);

  useEffect(() => {
    if (!chainConfigured) return;
    let cancelled = false;
    const read = () =>
      fetchChainSummary()
        .then((summary) => !cancelled && setChain(summary))
        .catch(() => undefined);
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <ul className="status-strip" aria-label="System status">
      <li>AutoEvolve Protocol</li>
      <li>Sepolia</li>
      {chain ? <li>Block {chain.block.toLocaleString("en-US")}</li> : null}
      <li>
        Registry{" "}
        <a href={etherscanAddress(REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">
          {truncateHash(REGISTRY_ADDRESS)}
        </a>
      </li>
      {bridgeConfigured ? (
        <li>
          {BRIDGE[live]}
          {live === "lost" && lastEventAt ? `, showing data as of ${new Date(lastEventAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
        </li>
      ) : null}
      <li>{chain ? `${chain.entries} entries` : `${bakedMemory.length} entries, snapshot`}</li>
      <li>{chain ? `${formatEth(chain.paidWei)} paid` : `${formatEth(bakedChain.balances.total_paid_wei)} paid, snapshot`}</li>
    </ul>
  );
}
