import React, { useState, useEffect } from "react";

// Emmanuel = Gemini scouts the market (live data), Fable judges and places the trade.
// This card shows every scan: what the scout proposed, what the judge said, and what it cost.

const MONO = "'Space Mono', monospace";
const GREEN = "#00e5a0";
const RED = "#ff4757";
const AMBER = "#ffa502";
const MUTED = "#8b949e";
const GOLD = "#f5c542";
const BASE = process.env.REACT_APP_API_BASE || "https://fxangel-backend-production.up.railway.app";

const money = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const tone = (n) => (n > 0 ? GREEN : n < 0 ? RED : MUTED);
const VERDICT = {
  AGREE: { text: "JUDGE AGREED", color: GREEN },
  DISAGREE: { text: "JUDGE SAID SKIP", color: RED },
  FLIP: { text: "JUDGE FLIPPED", color: AMBER },
  NONE: { text: "SCOUT: NOTHING GOOD", color: MUTED },
  ERROR: { text: "SCAN FAILED", color: RED },
  NOT_JUDGED: { text: "NOT JUDGED", color: MUTED },
};

export default function EmmanuelReview() {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${BASE}/api/arena/emmanuel?limit=20`);
        if (!res.ok) throw new Error();
        const j = await res.json();
        if (alive) { setData(j); setOffline(false); }
      } catch { if (alive) setOffline(true); }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const card = { background: "#0d1117", border: `1px solid ${GOLD}55`, borderLeft: `4px solid ${GOLD}`, borderRadius: 12, padding: 14 };
  if (offline && !data) return <div style={{ ...card, color: AMBER, fontFamily: MONO, fontSize: 10 }}>Can't reach the server, or it doesn't have Emmanuel yet.</div>;
  if (!data) return <div style={{ ...card, color: MUTED, fontFamily: MONO, fontSize: 10 }}>Loading…</div>;

  const s = data.summary;
  const Stat = ({ label, big, sub, color }) => (
    <div style={{ flex: "1 1 120px", minWidth: 110 }}>
      <div style={{ color: MUTED, fontFamily: MONO, fontSize: 9, letterSpacing: 0.8 }}>{label}</div>
      <div style={{ color: color || "#fff", fontFamily: MONO, fontSize: 16, fontWeight: 700, marginTop: 3 }}>{big}</div>
      <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{sub}</div>
    </div>
  );

  return (
    <div style={card}>
      <div style={{ color: "#cdd9e5", fontSize: 12, lineHeight: 1.6 }}>
        Every {data.periodMin} minutes, inside the trading window, Gemini studies the live market through tools and proposes one setup or nothing. Fable then judges it with the same data and limits as the other models, picks its own stop and target, and places the trade on Emmanuel's own account. Same coins and limits as everyone else.
      </div>
      {!data.enabled && (
        <div style={{ color: AMBER, fontFamily: MONO, fontSize: 10, marginTop: 10 }}>Switched off (EMMANUEL_ENABLED=false, a missing GEMINI_API_KEY or ANTHROPIC_API_KEY, or turned off in Settings).</div>
      )}
      {data.enabled && data.cache && !data.cache.fresh && (
        <div style={{ color: AMBER, fontFamily: MONO, fontSize: 10, marginTop: 10 }}>
          Live market data is not ready ({data.cache.connected ? `loading history ${data.cache.backfilled}/${data.cache.backfillTarget}` : "not connected"}){data.cache.lastError ? ` · ${data.cache.lastError}` : ""}. Scans wait until it is.
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
        <Stat label="SCANS" big={s.scans} sub={`${s.proposed} proposed · ${s.none} nothing${s.errors ? ` · ${s.errors} failed` : ""}`} />
        <Stat label="JUDGE" big={`${s.agree} yes`} color={GREEN} sub={`${s.disagree} skip · ${s.flip} flipped`} />
        {s.own && s.own.n > 0 && <Stat label="EMMANUEL'S TRADES" big={money(s.own.net)} color={tone(s.own.net)} sub={`${s.own.n} closed${s.own.winRate != null ? ` · ${s.own.winRate}% won` : ""}${s.own.open ? ` · ${s.own.open} open` : ""}`} />}
        <Stat label="SPENT TODAY" big={`$${data.spentToday.toFixed(2)}`} sub={`of $${data.budgetUsd} · ${data.scansToday}/${data.maxScans} scans · $${s.spent.toFixed(2)} in total`} />
      </div>

      <div style={{ marginTop: 14 }}>
        {data.rows.length === 0 && <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9 }}>No scans yet. The first one runs at the next full hour inside the trading window.</div>}
        {data.rows.filter((r) => !r.skippedBudget).slice(0, 12).map((r) => {
          const v = VERDICT[r.verdict] || { text: r.verdict || "…", color: MUTED };
          return (
            <div key={r.id} style={{ borderTop: "1px solid #21262d", padding: "8px 0" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontFamily: MONO, fontSize: 10 }}>
                {r.scout?.pair && <span style={{ color: "#fff", fontWeight: 700 }}>{r.scout.direction} {r.scout.pair}</span>}
                <span style={{ color: v.color }}>{v.text}{r.judge?.action && r.verdict === "FLIP" ? ` → ${r.judge.action}` : ""}{r.judge?.confidence ? ` ${r.judge.confidence}%` : ""}</span>
                {r.judge?.slPct != null && <span style={{ color: MUTED }}>SL {r.judge.slPct}% · TP {r.judge.tpPct}%</span>}
                {r.judge?.executed && <span style={{ color: GOLD }}>traded</span>}
                {r.judge && !r.judge.executed && r.judge.action !== "SKIP" && r.judge.note && <span style={{ color: AMBER }}>{r.judge.note.startsWith("shadow") ? "shadow (no account yet)" : "not opened"}</span>}
                <span style={{ color: MUTED }}>{new Date(r.ts).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span style={{ color: MUTED, marginLeft: "auto" }}>{r.pnl != null ? <span style={{ color: tone(r.pnl) }}>{money(r.pnl)} · </span> : null}${(r.costUsd || 0).toFixed(3)}</span>
              </div>
              {r.scout?.reason && <div style={{ color: MUTED, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}><b style={{ color: "#cdd9e5" }}>Scout:</b> {r.scout.reason}</div>}
              {r.judge?.reason && <div style={{ color: MUTED, fontSize: 11, marginTop: 2, lineHeight: 1.5 }}><b style={{ color: "#cdd9e5" }}>Judge:</b> {r.judge.reason}</div>}
              {r.error && <div style={{ color: RED, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>{r.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
