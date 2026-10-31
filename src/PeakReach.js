import React from "react";

// How far trades ran in profit before they closed, as % of price.
// peakProfit is the best unrealised $ profit the app saw while the trade was open,
// so % of price = peakProfit / (qty × entry). The app samples the price, so a very
// short spike can be missed: the numbers are a floor, not an exact peak.

const MONO = "'Space Mono', monospace";
const THRESHOLDS = [0.5, 1, 1.5, 2];
const GREEN = "#00e5a0";
const AMBER = "#ffa502";

export function peakPctOf(t) {
  const entry = parseFloat(t.entry ?? t.entryPrice);
  const qty = parseFloat(t.qty);
  const pk = parseFloat(t.peakProfit);
  if (!(entry > 0) || !(qty > 0) || !Number.isFinite(pk)) return null;
  return Math.max(0, (pk / (qty * entry)) * 100);
}

function summarise(rows) {
  const pcts = rows.map(peakPctOf).filter((v) => v != null);
  const n = pcts.length;
  return {
    n,
    avg: n ? pcts.reduce((s, v) => s + v, 0) / n : null,
    reach: THRESHOLDS.map((th) => (n ? Math.round((pcts.filter((v) => v >= th).length / n) * 100) : null)),
  };
}

// groups: [{ key, label, color, rows }]
export default function PeakReach({ groups }) {
  const list = groups.map((g) => ({ ...g, s: summarise(g.rows) }));
  const th = { color: "#8b949e", fontFamily: MONO, fontSize: 9, fontWeight: 400, textAlign: "right", padding: "8px 8px", whiteSpace: "nowrap" };
  const td = { fontFamily: MONO, fontSize: 12, textAlign: "right", padding: "10px 8px", whiteSpace: "nowrap", color: "#cdd9e5" };
  const stick = { position: "sticky", left: 0, background: "#0d1117", zIndex: 1 };
  const any = list.some((g) => g.s.n);

  return (
    <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 470 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #21262d" }}>
              <th style={{ ...th, ...stick, textAlign: "left", paddingLeft: 12 }}>TEAM</th>
              <th style={th}>TRADES</th>
              <th style={th}>AVG PEAK</th>
              {THRESHOLDS.map((v) => <th key={v} style={th}>≥ {v}%</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.key} style={{ borderBottom: "1px solid #161b22" }}>
                <td style={{ ...td, ...stick, textAlign: "left", paddingLeft: 12 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: g.color, marginRight: 7 }} />
                  <span style={{ color: g.color, fontWeight: 700 }}>{g.label}</span>
                </td>
                <td style={td}>{g.s.n || "–"}</td>
                <td style={td}>{g.s.avg == null ? "–" : `${g.s.avg.toFixed(2)}%`}</td>
                {g.s.reach.map((r, i) => (
                  <td key={i} style={{ ...td, color: r == null ? "#484f58" : r >= 33 ? GREEN : r >= 15 ? AMBER : "#ff4757", fontWeight: 700 }}>
                    {r == null ? "–" : `${r}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, padding: "8px 12px", lineHeight: 1.6 }}>
        {any
          ? "Share of each team's trades whose best moment in profit reached at least that % of price (before closing). TRADES counts only trades with peak data. A target above the green numbers is rarely reachable. Peaks are sampled, so short spikes can be missed."
          : "No peak data yet. It is recorded for trades closed since the peak tracking was added."}
      </div>
    </div>
  );
}
