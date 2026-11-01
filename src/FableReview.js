import React, { useState, useEffect } from "react";

// Fable second opinion (shadow mode): for each baseline signal Fable says AGREE or DISAGREE.
// Nothing is blocked; this card shows what the baseline would have made if it had skipped the DISAGREE trades.

const MONO = "'Space Mono', monospace";
const GREEN = "#00e5a0";
const RED = "#ff4757";
const AMBER = "#ffa502";
const MUTED = "#8b949e";
const BASE = process.env.REACT_APP_API_BASE || "https://fxangel-backend-production.up.railway.app";

const money = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const tone = (n) => (n > 0 ? GREEN : n < 0 ? RED : MUTED);

export default function FableReview() {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${BASE}/api/arena/fable?limit=30`);
        if (!res.ok) throw new Error();
        const j = await res.json();
        if (alive) { setData(j); setOffline(false); }
      } catch { if (alive) setOffline(true); }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const card = { background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 14 };
  if (offline && !data) return <div style={{ ...card, color: AMBER, fontFamily: MONO, fontSize: 10 }}>Can't reach the server, or it doesn't have the Fable review yet.</div>;
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
        Fable reads every baseline signal and says AGREE or DISAGREE. It never blocks a trade; this only records
        what would have happened if the baseline had skipped the trades Fable disagreed with.
      </div>
      {!data.enabled && (
        <div style={{ color: AMBER, fontFamily: MONO, fontSize: 10, marginTop: 10 }}>Switched off (FABLE_REVIEW_ENABLED=false, or no ANTHROPIC_API_KEY).</div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
        <Stat label="FABLE AGREED" big={money(s.agree.net)} color={tone(s.agree.net)} sub={`${s.agree.n} trades${s.agree.winRate != null ? ` · ${s.agree.winRate}% won` : ""}`} />
        <Stat label="FABLE DISAGREED" big={money(s.disagree.net)} color={tone(s.disagree.net)} sub={`${s.disagree.n} trades${s.disagree.winRate != null ? ` · ${s.disagree.winRate}% won` : ""}`} />
        <Stat label="SPENT" big={`$${s.spent.toFixed(2)}`} sub={`${s.reviews} reviews · ${data.callsToday}/${data.dailyCap} today`} />
      </div>
      {s.scored > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: "#cdd9e5", lineHeight: 1.6 }}>
          Baseline alone: <b style={{ color: tone(s.baselineNet) }}>{money(s.baselineNet)}</b> · with Fable's filter: <b style={{ color: tone(s.filteredNet) }}>{money(s.filteredNet)}</b>
          {s.scored < 30 && <span style={{ color: AMBER }}> · only {s.scored} finished trades, a hint rather than a result</span>}
        </div>
      )}
      {s.scored === 0 && <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, marginTop: 12 }}>No finished trades with a Fable verdict yet.</div>}

      <div style={{ marginTop: 14 }}>
        {data.rows.slice(0, 12).map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid #21262d", padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontFamily: MONO, fontSize: 10 }}>
              <span style={{ color: "#fff", fontWeight: 700 }}>{r.direction} {r.pair}</span>
              <span style={{ color: r.verdict === "AGREE" ? GREEN : r.verdict === "DISAGREE" ? RED : MUTED }}>{r.verdict || (r.skippedCap ? "daily cap" : "no answer")}{r.verdict ? ` ${r.confidence}%` : ""}</span>
              <span style={{ color: MUTED }}>{new Date(r.ts).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              {r.pnl != null && <span style={{ color: tone(r.pnl), marginLeft: "auto" }}>{money(r.pnl)}</span>}
              {r.pnl == null && r.traded && <span style={{ color: MUTED, marginLeft: "auto" }}>open</span>}
            </div>
            {r.reason && <div style={{ color: MUTED, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>{r.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
