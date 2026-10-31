"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { REAL_RUN_ID, SNAPSHOT_NOTE, bakedChain, type ChainRow } from "@/lib/baked";
import { chainConfigured, etherscanTx, fetchBalances, fetchChainLog } from "@/lib/chain";
import { formatDay, formatEth, formatTime, truncateHash } from "@/lib/format";
import { BarValue, stagger } from "./charts";
import { rippleChange } from "./Ripple";
import { CountUp, HashChip, StatusBadge, useEntrance } from "./ui";

type EventName = ChainRow["event"];

const DAY_MS = 86400000;
// Rows past this one join the last of the cascade rather than keeping a long table waiting.
const LAST_STAGGERED_ROW = 14;

// In the order they happen: a proven improvement and its reward share a transaction, reuse comes later.
const KINDS: { event: EventName; name: string; one: string; note: string }[] = [
  { event: "ImprovementRecorded", name: "Improvements", one: "improvement", note: "An agent proved a change scored higher, or saved one that failed." },
  { event: "RewardPaid", name: "Rewards", one: "reward", note: "Paid from escrow for each proven improvement." },
  { event: "EvidencePosted", name: "Reuse reports", one: "reuse report", note: "An agent reused a saved entry and said whether it held up." },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const sumWei = (rows: ChainRow[]) => rows.reduce((sum, row) => sum + BigInt(row.amount_wei ?? "0"), 0n).toString();

function agentName(address: string) {
  const agent = bakedChain.balances.agents.find((a) => a.address.toLowerCase() === address.toLowerCase());
  return agent?.label ?? truncateHash(address);
}

function action(row: ChainRow) {
  if (row.event === "RewardPaid") return "earned a reward";
  if (row.event === "EvidencePosted") return "reported on a reused entry";
  return row.verified ? "proved an improvement" : "saved a failed attempt";
}

function split(event: EventName, rows: ChainRow[]) {
  if (event === "RewardPaid") return `${formatEth(sumWei(rows))} paid`;
  if (event === "EvidencePosted") {
    const held = rows.filter((row) => row.supported).length;
    return `${held} held up, ${rows.length - held} did not`;
  }
  const proven = rows.filter((row) => row.verified).length;
  return `${proven} proven, ${rows.length - proven} failed`;
}

function Result({ row }: { row: ChainRow }) {
  if (row.event === "RewardPaid") return <span className="mono text-xs">+{formatEth(row.amount_wei ?? "0")}</span>;
  if (row.event === "EvidencePosted") return <StatusBadge status={row.supported ? "held" : "notHeld"} />;
  return <StatusBadge status={row.verified ? "verified" : "avoid"} />;
}

// Direct log reads have no timestamps, so this only appears when rows carry them.
function ActivityChart({ rows, filter }: { rows: ChainRow[]; filter: EventName | null }) {
  const timed = rows.filter((row) => row.ts);
  if (timed.length < 2) return null;
  const dayOf = (row: ChainRow) => Math.floor(row.ts / DAY_MS);
  const first = Math.min(...timed.map(dayOf));
  const days = Array.from({ length: Math.max(...timed.map(dayOf)) - first + 1 }, () => [] as ChainRow[]);
  for (const row of timed) days[dayOf(row) - first].push(row);
  const peak = Math.max(...days.map((day) => day.length));
  const date = (index: number) => formatDay((first + index) * DAY_MS);

  return (
    <section className="chain-activity" aria-label={`Events per day from ${date(0)} to ${date(days.length - 1)}. The table below lists each one.`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label">Activity by day</h2>
        <span className="notice">Busiest day: {plural(peak, "event")}</span>
      </div>
      <div className="day-bars" aria-hidden="true">
        {days.map((day, i) => {
          const parts = KINDS.map((kind) => ({ ...kind, count: day.filter((row) => row.event === kind.event).length })).filter((part) => part.count);
          const words = parts.map((part) => plural(part.count, part.one)).join(", ");
          return (
            <div key={i} className="day" title={`${date(i)}: ${words || "no events"}`}>
              <div className="day-stack" style={{ ...stagger(i), height: `${(day.length / peak) * 100}%` }}>
                {parts.map((part) => (
                  <i key={part.event} data-kind={part.event} data-dim={(filter && filter !== part.event) || undefined} style={{ flexGrow: part.count }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="notice flex justify-between">
        <span>{date(0)}</span>
        <span>{date(days.length - 1)}</span>
      </div>
    </section>
  );
}

const { agents: AGENTS, escrow: ESCROW } = bakedChain.balances;
const ACCOUNTS = [{ label: "Escrow", address: ESCROW.address, wei: ESCROW.wei }, ...AGENTS];

// Read live when the chain answers, otherwise from the snapshot.
function Funds({ rows, balances }: { rows: ChainRow[]; balances: Record<string, string> | null }) {
  const accounts = ACCOUNTS.map((account) => ({ ...account, wei: balances?.[account.address] ?? account.wei }));
  const total = accounts.reduce((sum, account) => sum + BigInt(account.wei), 0n);
  const share = (wei: string) => (total ? Number((BigInt(wei) * 1000n) / total) / 10 : 0);
  const total_paid_wei = sumWei(rows);
  const paid = BigInt(total_paid_wei);
  const funded = paid + BigInt(accounts[0].wei);
  const paidShare = funded ? Number((paid * 1000n) / funded) / 10 : 0;

  return (
    <section className="chain-funds">
      <h2 className="label">Who holds the funds</h2>
      <ul>
        {accounts.map((account, i) => (
          <li key={account.label} style={stagger(i)}>
            <span>{account.label}</span>
            <BarValue value={share(account.wei)} max={100} text={formatEth(account.wei)} />
          </li>
        ))}
      </ul>
      <p className="notice">
        {formatEth(total_paid_wei)} paid out so far, {paidShare}% of the escrow fund.
      </p>
    </section>
  );
}

export function ChainLogTable() {
  const [filter, setFilter] = useState<EventName | null>(null);
  const [liveRows, setLiveRows] = useState<ChainRow[] | null>(null);
  const [balances, setBalances] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reading = chainConfigured && !liveRows && !failed;
  const rows = liveRows ?? bakedChain.log;
  const overview = useEntrance<HTMLDivElement>(0);
  const log = useEntrance<HTMLDivElement>(0);

  useEffect(() => {
    if (!chainConfigured) return;
    let cancelled = false;
    setFailed(false);
    Promise.all([fetchChainLog(), fetchBalances(ACCOUNTS.map((account) => account.address))])
      .then(([log, funds]) => {
        if (cancelled) return;
        // The registry has entries, so an empty read means the RPC dropped them.
        if (!log.length) throw new Error("No logs returned");
        setLiveRows(log);
        setBalances(funds);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const visible = useMemo(() => (filter ? rows.filter((row) => row.event === filter) : rows), [rows, filter]);
  const timed = rows.some((row) => row.ts);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>On-chain record</h1>
          <p>What the agents proved, earned and reported, as written to Sepolia.</p>
        </div>
      </header>
      {liveRows ? <p className="sample-note">Read live from Sepolia.</p> : null}
      {reading ? <p className="sample-note">Reading Sepolia logs. {SNAPSHOT_NOTE}</p> : null}
      {!chainConfigured ? <p className="sample-note">{SNAPSHOT_NOTE}</p> : null}
      {failed ? (
        <p className="sample-note flex items-center gap-3">
          Could not read Sepolia logs. {SNAPSHOT_NOTE}
          <button type="button" className="btn" onClick={() => setAttempt(attempt + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      <div className="chain-steps" role="group" aria-label="Filter events by type">
        {KINDS.map((kind, i) => {
          const matching = rows.filter((row) => row.event === kind.event);
          return (
            <button
              key={kind.event}
              type="button"
              className="chain-step"
              style={stagger(i)}
              data-kind={kind.event}
              aria-pressed={filter === kind.event}
              onClick={() => rippleChange(() => setFilter(filter === kind.event ? null : kind.event))}
            >
              <span className="chain-step-name label">
                <i className="kind-mark" data-kind={kind.event} />
                {kind.name}
              </span>
              <span className="chain-step-figures">
                <b>
                  <CountUp value={matching.length} from={0} delay={i * 0.08} />
                </b>
                <span>{split(kind.event, matching)}</span>
              </span>
              <span className="chain-step-note">{kind.note}</span>
            </button>
          );
        })}
      </div>
      <div ref={overview.ref} className="chain-overview" data-entrance={overview.entrance}>
        <ActivityChart rows={rows} filter={filter} />
        <Funds rows={rows} balances={balances} />
      </div>
      <div ref={log.ref} data-entrance={log.entrance}>
        <div className="chain-log-head">
          <h2 className="label">Every event, newest first</h2>
          <span className="notice">
            Showing {visible.length} of {rows.length}
          </span>
          {filter ? (
            <button type="button" className="btn" onClick={() => rippleChange(() => setFilter(null))}>
              Show all
            </button>
          ) : null}
        </div>
        {visible.length ? (
          <div className="ledger-scroll">
            <table className="ledger chain-log">
              <thead>
                <tr className="label">
                  {timed ? <th scope="col">When (UTC)</th> : null}
                  <th scope="col">What happened</th>
                  <th scope="col">Result</th>
                  <th scope="col">Entry</th>
                  <th scope="col">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => (
                  <tr key={`${row.tx}-${row.event}-${i}`} style={stagger(Math.min(i, LAST_STAGGERED_ROW))}>
                    {timed ? (
                      <td className="mono text-xs text-mist-300 whitespace-nowrap">
                        {row.ts ? `${formatDay(row.ts)}, ${formatTime(row.ts).slice(11, 16)}` : "-"}
                      </td>
                    ) : null}
                    <td>
                      <span className="chain-what">
                        <i className="kind-mark" data-kind={row.event} aria-hidden="true" />
                        <span>
                          <b title={row.actor}>{agentName(row.actor)}</b> {action(row)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <Result row={row} />
                    </td>
                    <td>
                      <HashChip value={row.entry_id} />
                    </td>
                    <td>
                      <HashChip value={row.tx} href={etherscanTx(row.tx)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid justify-items-start gap-2 p-6">
            <p className="notice">{rows.length ? "Nothing of this type yet." : "No improvements recorded yet. Start a run to see one here."}</p>
            {rows.length ? null : (
              <Link href={`/run/${REAL_RUN_ID}?play=1`} className="btn">
                Watch a run
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
