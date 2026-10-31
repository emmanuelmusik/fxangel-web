import React, { useState, useEffect, useMemo, useCallback } from "react";
import ArenaCharts from "./ArenaCharts";

// ─── ARENA ────────────────────────────────────────────────────────────────────
// Claude / Grok / Gemini / OpenAI vs the rules engine, each on its own Binance
// sub-account. Everything here is read from the backend's /api/arena/* routes.

const MONO = "'Space Mono', monospace";
const BEBAS = "'Bebas Neue', sans-serif";
const GREEN = "#00e5a0";
const RED = "#ff4757";
const AMBER = "#ffa502";

const COLORS = {
  claude: "#e8a05a",
  grok: "#2dd4bf",
  gemini: "#6ea8ff",
  openai: "#b583ff",
  baseline: "#8b949e",
};
const colorOf = (k) => COLORS[k] || "#8b949e";
// card look per account: soft colour wash, coloured edge, so each model is recognisable at a glance
const tint = (k) => ({
  background: `linear-gradient(135deg, ${colorOf(k)}3d 0%, ${colorOf(k)}1c 42%, #0d1117 75%)`,
  border: `1px solid ${colorOf(k)}66`,
  borderLeft: `4px solid ${colorOf(k)}`,
});
const ORDER = ["claude", "grok", "gemini", "openai", "baseline"];
const REFRESH_MS = 15000;

// ─── helpers ──────────────────────────────────────────────────────────────────
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n, digits = 2) => {
  if (n == null || !Number.isFinite(n)) return "–";
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return `${r >= 0 ? "+" : "−"}$${Math.abs(r).toFixed(digits)}`;
};
const pnlColor = (n) => (Math.round(n * 100) > 0 ? GREEN : Math.round(n * 100) < 0 ? RED : "#8b949e");
const price = (n) => {
  if (n == null || !Number.isFinite(+n)) return "–";
  const v = +n;
  if (v >= 1000) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  return v.toFixed(5);
};
const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–";
const dayTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "–";
const ago = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const duration = (a, b) => {
  if (!a || !b) return "";
  const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
const nextDecision = () => {
  const now = Date.now();
  const slot = 15 * 60 * 1000;
  return new Date(Math.floor((now - 10000) / slot) * slot + slot + 10000);
};

async function get(path) {
  try {
    const BASE = process.env.REACT_APP_API_BASE || "https://fxangel-backend-production.up.railway.app";
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── small pieces ─────────────────────────────────────────────────────────────
function Pill({ children, color, solid }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 4,
        fontFamily: MONO,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.5,
        color: solid ? "#010409" : color,
        background: solid ? color : `${color}18`,
        border: `1px solid ${solid ? color : `${color}40`}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function ModelTag({ k, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorOf(k), flexShrink: 0 }} />
      <span style={{ color: colorOf(k), fontSize: 12, fontWeight: 700 }}>{label}</span>
    </span>
  );
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "26px 0 10px" }}>
      <div style={{ color: "#fff", fontFamily: BEBAS, fontSize: 18, letterSpacing: 2 }}>{children}</div>
      {right}
    </div>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#0d1117",
        border: "1px solid #21262d",
        borderRadius: 12,
        padding: 14,
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              flexShrink: 0,
              background: on ? `${o.color || "#ff4757"}22` : "transparent",
              border: `1px solid ${on ? o.color || "#ff4757" : "#30363d"}`,
              color: on ? "#fff" : "#8b949e",
              borderRadius: 16,
              padding: "5px 11px",
              fontFamily: MONO,
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div
      style={{
        border: "1px dashed #30363d",
        borderRadius: 12,
        padding: "22px 16px",
        textAlign: "center",
        color: "#8b949e",
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

// ─── status strip ─────────────────────────────────────────────────────────────
function StatusStrip({ status }) {
  const gate = status?.gateNow;
  const blocked = !!gate?.blocked;
  const next = nextDecision();
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: blocked ? AMBER : GREEN,
          boxShadow: `0 0 8px ${blocked ? AMBER : GREEN}`,
          animation: "pulse 2s infinite",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>
          {blocked ? `Paused: ${gate.reason}` : "Trading window open"}
        </div>
        <div style={{ color: "#8b949e", fontSize: 11, marginTop: 2 }}>
          {blocked ? "Models are not asked while paused." : `Next decision round about ${clock(next)}`}
          {status?.arenaStart ? ` · running since ${dayTime(status.arenaStart)}` : ""}
        </div>
      </div>
    </Card>
  );
}

// ─── leaderboard ──────────────────────────────────────────────────────────────
function modeBadge(mode) {
  const m = (mode || "").toLowerCase();
  if (m.startsWith("live")) return <Pill color={GREEN}>LIVE</Pill>;
  if (m.startsWith("shadow")) return <Pill color={AMBER}>SHADOW</Pill>;
  return <Pill color="#8b949e">OFF</Pill>;
}

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color: "#8b949e", fontFamily: MONO, fontSize: 9, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: color || "#fff", fontFamily: MONO, fontSize: 13, fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function Wallet({ w }) {
  if (!w) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderTop: "1px solid #21262d",
        marginTop: 12,
        paddingTop: 10,
      }}
    >
      <span style={{ color: "#8b949e", fontFamily: MONO, fontSize: 9, letterSpacing: 0.5 }}>WALLET</span>
      {w.error || w.equity == null ? (
        <span style={{ color: AMBER, fontFamily: MONO, fontSize: 10 }}>unavailable</span>
      ) : (
        <span style={{ fontFamily: MONO, fontSize: 12 }}>
          <span style={{ color: "#fff", fontWeight: 700 }}>${w.equity.toFixed(2)}</span>
          <span style={{ color: "#8b949e" }}> · free ${w.available.toFixed(2)}</span>
        </span>
      )}
    </div>
  );
}

// ─── league table ─────────────────────────────────────────────────────────────
// One row per live account, ranked by net profit, with a totals row. Built from the
// same closed-trade list as everything else so the numbers always agree.
function LeagueTable({ rows, trades }) {
  const table = useMemo(() => {
    const live = (rows || []).filter((r) => (r.mode || "").toLowerCase().startsWith("live") || r.account === "baseline");
    const list = live.map((r) => {
      const mine = trades.filter((t) => t.account === r.account).sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
      const wins = mine.filter((t) => t.pnl > 0), losses = mine.filter((t) => t.pnl <= 0);
      const won = wins.reduce((s, t) => s + t.pnl, 0), lost = losses.reduce((s, t) => s + t.pnl, 0);
      return {
        account: r.account, label: (r.label || r.account).replace(" (rules engine)", ""),
        p: mine.length, w: wins.length, l: losses.length,
        pct: mine.length ? Math.round((wins.length / mine.length) * 100) : null,
        won, lost, net: Math.round((won + lost) * 100) / 100,
        best: mine.length ? Math.max(...mine.map((t) => t.pnl)) : null,
        worst: mine.length ? Math.min(...mine.map((t) => t.pnl)) : null,
        form: mine.slice(-5).map((t) => t.pnl > 0),
      };
    }).sort((a, b) => b.net - a.net || b.p - a.p);
    const tot = list.reduce((a, r) => ({ p: a.p + r.p, w: a.w + r.w, l: a.l + r.l, won: a.won + r.won, lost: a.lost + r.lost, net: a.net + r.net }), { p: 0, w: 0, l: 0, won: 0, lost: 0, net: 0 });
    tot.pct = tot.p ? Math.round((tot.w / tot.p) * 100) : null;
    tot.best = list.reduce((m, r) => (r.best == null ? m : m == null ? r.best : Math.max(m, r.best)), null);
    tot.worst = list.reduce((m, r) => (r.worst == null ? m : m == null ? r.worst : Math.min(m, r.worst)), null);
    return { list, tot };
  }, [rows, trades]);

  if (!table.list.length) return <Empty>No live accounts yet.</Empty>;
  const th = { color: "#8b949e", fontFamily: MONO, fontSize: 9, fontWeight: 400, textAlign: "right", padding: "8px 8px", whiteSpace: "nowrap", letterSpacing: 0.5 };
  const td = { fontFamily: MONO, fontSize: 12, textAlign: "right", padding: "10px 8px", whiteSpace: "nowrap", color: "#cdd9e5" };
  const stick = { position: "sticky", left: 0, background: "#0d1117", zIndex: 1 };
  const m = (v) => (v == null ? "–" : money(v));

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #21262d" }}>
              <th style={{ ...th, ...stick, textAlign: "left", paddingLeft: 12 }}>#  TEAM</th>
              <th style={th}>P</th><th style={th}>W</th><th style={th}>L</th><th style={th}>WIN %</th><th style={th}>NET</th>
              <th style={th}>WON</th><th style={th}>LOST</th><th style={th}>BEST</th><th style={th}>WORST</th>
              <th style={{ ...th, paddingRight: 12 }}>FORM</th>
            </tr>
          </thead>
          <tbody>
            {table.list.map((r, i) => (
              <tr key={r.account} style={{ borderBottom: "1px solid #161b22" }}>
                <td style={{ ...td, ...stick, textAlign: "left", paddingLeft: 12 }}>
                  <span style={{ color: "#8b949e", marginRight: 8, display: "inline-block", width: 14 }}>{i + 1}</span>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: colorOf(r.account), marginRight: 7 }} />
                  <span style={{ color: "#fff", fontWeight: 700 }}>{r.label}</span>
                </td>
                <td style={td}>{r.p}</td>
                <td style={{ ...td, color: r.w ? GREEN : "#484f58" }}>{r.w}</td>
                <td style={{ ...td, color: r.l ? RED : "#484f58" }}>{r.l}</td>
                <td style={td}>{r.pct == null ? "–" : `${r.pct}%`}</td>
                <td style={{ ...td, color: pnlColor(r.net), fontWeight: 700 }}>{r.p ? money(r.net) : "–"}</td>
                <td style={{ ...td, color: GREEN }}>{r.p ? money(r.won) : "–"}</td>
                <td style={{ ...td, color: RED }}>{r.p ? money(r.lost) : "–"}</td>
                <td style={td}>{m(r.best)}</td>
                <td style={td}>{m(r.worst)}</td>
                <td style={{ ...td, paddingRight: 12 }}>
                  {r.form.length ? r.form.map((w, k) => (
                    <span key={k} style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, marginLeft: 3, background: w ? GREEN : RED }} />
                  )) : "–"}
                </td>
              </tr>
            ))}
            <tr style={{ background: "#161b22" }}>
              <td style={{ ...td, ...stick, background: "#161b22", textAlign: "left", paddingLeft: 12, color: "#fff", fontWeight: 700 }}>
                <span style={{ display: "inline-block", width: 22 }} />TOTAL
              </td>
              <td style={{ ...td, color: "#fff", fontWeight: 700 }}>{table.tot.p}</td>
              <td style={{ ...td, color: GREEN, fontWeight: 700 }}>{table.tot.w}</td>
              <td style={{ ...td, color: RED, fontWeight: 700 }}>{table.tot.l}</td>
              <td style={{ ...td, color: "#fff", fontWeight: 700 }}>{table.tot.pct == null ? "–" : `${table.tot.pct}%`}</td>
              <td style={{ ...td, color: pnlColor(table.tot.net), fontWeight: 700 }}>{table.tot.p ? money(table.tot.net) : "–"}</td>
              <td style={{ ...td, color: GREEN, fontWeight: 700 }}>{table.tot.p ? money(table.tot.won) : "–"}</td>
              <td style={{ ...td, color: RED, fontWeight: 700 }}>{table.tot.p ? money(table.tot.lost) : "–"}</td>
              <td style={td}>{m(table.tot.best)}</td>
              <td style={td}>{m(table.tot.worst)}</td>
              <td style={{ ...td, paddingRight: 12 }}>–</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, padding: "8px 12px", lineHeight: 1.5 }}>
        P played · W wins · L losses · WON/LOST gross profit and loss · FORM last 5 (green = win) · NET after fees. Ranked by NET. Total includes the baseline.
      </div>
    </Card>
  );
}

function Leaderboard({ rows, openCounts, wallets }) {
  const sorted = useMemo(() => {
    const live = rows.filter((r) => (r.mode || "").toLowerCase().startsWith("live") || r.account === "baseline");
    const rest = rows.filter((r) => !live.includes(r));
    live.sort((a, b) => b.netPnl - a.netPnl);
    rest.sort((a, b) => ORDER.indexOf(a.account) - ORDER.indexOf(b.account));
    return [...live, ...rest];
  }, [rows]);

  return (
    <div className="fx-cols" style={{ display: "grid", gap: 10 }}>
      {sorted.map((r, i) => {
        const isShadow = !((r.mode || "").toLowerCase().startsWith("live") || r.account === "baseline");
        const off = (r.mode || "").toLowerCase().startsWith("off");
        return (
          <Card key={r.account} style={{ ...tint(r.account), opacity: off ? 0.55 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {!isShadow && <span style={{ color: "#8b949e", fontFamily: MONO, fontSize: 11 }}>#{i + 1}</span>}
                <ModelTag k={r.account} label={r.label} />
                {r.model && <span style={{ color: "#484f58", fontFamily: MONO, fontSize: 9 }}>{r.model}</span>}
              </div>
              {r.account === "baseline" ? <Pill color="#8b949e">RULES</Pill> : modeBadge(r.mode)}
            </div>

            {isShadow ? (
              <div style={{ color: "#8b949e", fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
                {off
                  ? "Switched off (no model key or paused)."
                  : "Shadow mode: decisions are logged but no orders are placed, so there is no profit or loss yet."}
                {r.decisions != null && (
                  <div style={{ fontFamily: MONO, fontSize: 10, marginTop: 6 }}>
                    asked {r.decisions}× · BUY {r.buys} · SELL {r.sells} · SKIP {r.skips}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "10px 0 12px" }}>
                  <div style={{ color: pnlColor(r.netPnl), fontFamily: BEBAS, fontSize: 34, letterSpacing: 1, lineHeight: 1 }}>
                    {money(r.netPnl)}
                  </div>
                  <div style={{ color: "#8b949e", fontSize: 11 }}>realised, after fees</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Stat label="TRADES" value={r.trades} />
                  <Stat label="WIN RATE" value={r.winRate == null ? "–" : `${r.winRate}%`} />
                  <Stat label="PROFIT FACTOR" value={r.profitFactor == null ? "–" : r.profitFactor} />
                  <Stat label="OPEN" value={openCounts[r.account] || 0} color={openCounts[r.account] ? AMBER : "#fff"} />
                </div>
                {r.decisions != null && (
                  <div style={{ color: "#8b949e", fontFamily: MONO, fontSize: 10, marginTop: 10 }}>
                    asked {r.decisions}× · BUY {r.buys} · SELL {r.sells} · SKIP {r.skips}
                    {r.apiErrors ? ` · ${r.apiErrors} errors` : ""}
                    {r.tokensIn && r.decisions - (r.apiErrors || 0) > 0 ? ` · ~${Math.round(r.tokensIn / (r.decisions - (r.apiErrors || 0))).toLocaleString()} tokens in per answer` : ""}
                  </div>
                )}
                <Wallet w={wallets[r.account]} />
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── equity chart ─────────────────────────────────────────────────────────────
function EquityChart({ series, start }) {
  const [hidden, setHidden] = useState({});
  const W = 440, H = 210, PL = 44, PR = 10, PT = 12, PB = 24;

  const visible = series.filter((s) => !hidden[s.account]);
  const hasTrades = series.some((s) => s.points.length > 1);
  const t0 = start ? new Date(start).getTime() : Math.min(...series.flatMap((s) => s.points.map((p) => p.t)), Date.now());
  const t1 = Date.now();

  const values = visible.flatMap((s) => s.points.map((p) => p.v));
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;

  const x = (t) => PL + ((t - t0) / Math.max(1, t1 - t0)) * (W - PL - PR);
  const y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);

  const ticks = [lo, (lo + hi) / 2, hi].map((v) => +v.toFixed(2));
  const days = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getTime() + 86400000)) {
    const m = new Date(d); m.setHours(0, 0, 0, 0);
    if (m.getTime() > t0) days.push(m.getTime());
    if (days.length > 6) break;
  }

  return (
    <Card style={{ padding: "12px 10px 10px" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, padding: "0 4px" }}>
        {series.map((s) => (
          <button
            key={s.account}
            onClick={() => setHidden((h) => ({ ...h, [s.account]: !h[s.account] }))}
            style={{
              background: "transparent",
              border: `1px solid ${hidden[s.account] ? "#30363d" : colorOf(s.account)}`,
              color: hidden[s.account] ? "#484f58" : "#fff",
              borderRadius: 14,
              padding: "3px 9px",
              fontFamily: MONO,
              fontSize: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: hidden[s.account] ? "#30363d" : colorOf(s.account) }} />
            {s.label}
            <span style={{ color: hidden[s.account] ? "#484f58" : pnlColor(s.final) }}>{money(s.final, 0)}</span>
          </button>
        ))}
      </div>

      {!hasTrades ? (
        <div style={{ color: "#8b949e", fontSize: 12, textAlign: "center", padding: "36px 12px", lineHeight: 1.6 }}>
          No closed trades yet. Each model's line starts as soon as its first trade closes.
        </div>
      ) : (
        <svg className="fx-eq" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Cumulative profit and loss per model">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#21262d" strokeWidth="1" />
              <text x={PL - 6} y={y(v) + 3} textAnchor="end" fill="#8b949e" fontSize="9" fontFamily="Space Mono, monospace">
                {v >= 0 ? "" : "−"}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}
              </text>
            </g>
          ))}
          <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke="#484f58" strokeWidth="1" strokeDasharray="3 3" />
          {days.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PT} y2={H - PB} stroke="#161b22" strokeWidth="1" />
              <text x={x(t)} y={H - 8} textAnchor="middle" fill="#8b949e" fontSize="9" fontFamily="Space Mono, monospace">
                {new Date(t).toLocaleDateString([], { day: "2-digit", month: "short" })}
              </text>
            </g>
          ))}
          {visible.map((s) => {
            const pts = [...s.points, { t: t1, v: s.final }];
            return (
              <g key={s.account}>
                <polyline
                  fill="none"
                  stroke={colorOf(s.account)}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeDasharray={s.account === "baseline" ? "5 4" : undefined}
                  points={pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
                />
                <circle cx={x(t1)} cy={y(s.final)} r="3.5" fill={colorOf(s.account)} />
              </g>
            );
          })}
        </svg>
      )}
    </Card>
  );
}

// ─── open positions ───────────────────────────────────────────────────────────
function OpenPositions({ open }) {
  if (!open.length) return <Empty>No open positions right now.</Empty>;
  return (
    <div className="fx-cols" style={{ display: "grid", gap: 8 }}>
      {open.map((p) => (
        <Card key={`${p.account}-${p.pair}`} style={{ ...tint(p.account) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ModelTag k={p.account} label={p.label} />
              <span style={{ color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{p.pair}</span>
              <Pill color={p.direction === "BUY" ? GREEN : RED}>{p.direction === "BUY" ? "LONG" : "SHORT"}</Pill>
            </div>
            <div style={{ color: pnlColor(p.unrealizedPnl), fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
              {money(p.unrealizedPnl)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Stat label="ENTRY" value={price(p.entryPrice)} />
            <Stat label="NOW" value={price(p.price)} />
            <Stat label="STOP" value={price(p.sl)} color={RED} />
            <Stat label="TARGET" value={price(p.tp)} color={GREEN} />
          </div>
          <div style={{ color: "#8b949e", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
            Opened {ago(p.openTime)}
            {p.confidence != null ? ` · model confidence ${p.confidence}%` : ""}
            {p.reason ? <div style={{ color: "#cdd9e5", marginTop: 4 }}>“{p.reason}”</div> : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── closed trades ────────────────────────────────────────────────────────────
function Trades({ trades, reasons, filter }) {
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(25);
  const rows = trades.filter((t) => filter === "all" || t.account === filter);
  const total = rows.reduce((s, t) => s + t.pnl, 0);
  const wins = rows.filter((t) => t.pnl > 0).length;

  if (!rows.length) return <Empty>No closed trades for this selection yet.</Empty>;

  return (
    <div>
      <div style={{ display: "flex", gap: 14, color: "#8b949e", fontFamily: MONO, fontSize: 10, margin: "0 2px 8px" }}>
        <span>{rows.length} trades{rows.length > limit ? ` (showing ${limit})` : ""}</span>
        <span>{wins} wins</span>
        <span style={{ color: pnlColor(total) }}>{money(total)} net</span>
      </div>
      <div className="fx-cols" style={{ display: "grid", gap: 6 }}>
        {rows.slice(0, limit).map((t) => {
          const id = `${t.account}-${t.pair}-${t.closeTime}`;
          const open = openId === id;
          const why = t.decisionId ? reasons[t.decisionId] : null;
          return (
            <Card key={id} onClick={() => setOpenId(open ? null : id)} style={{ ...tint(t.account), padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorOf(t.account), flexShrink: 0 }} />
                  <span style={{ color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{t.pair}</span>
                  <Pill color={t.direction === "BUY" ? GREEN : RED}>{t.direction === "BUY" ? "LONG" : "SHORT"}</Pill>
                </div>
                <div style={{ color: pnlColor(t.pnl), fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{money(t.pnl)}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#8b949e", fontSize: 11, marginTop: 6 }}>
                <span>{t.label} · {dayTime(t.closeTime)}</span>
                <span>{t.reason || ""}</span>
              </div>
              {open && (
                <div style={{ borderTop: "1px solid #21262d", marginTop: 10, paddingTop: 10, fontSize: 11, color: "#8b949e", lineHeight: 1.7 }}>
                  <div>{t.entryPrice != null ? `Entry ${price(t.entryPrice)} → exit ${price(t.closePrice)}` : `Exit ${price(t.closePrice)}`}</div>
                  {t.openTime && <div>Held {duration(t.openTime, t.closeTime)} (opened {dayTime(t.openTime)})</div>}
                  {t.peakProfit != null && <div>Best unrealised profit during the trade: {money(num(t.peakProfit))}</div>}
                  {why ? (
                    <div style={{ color: "#cdd9e5", marginTop: 6 }}>
                      <span style={{ color: "#8b949e" }}>Why the model took it: </span>“{why.reason}”
                      {why.confidence ? ` (${why.confidence}% confident)` : ""}
                    </div>
                  ) : t.account !== "baseline" ? (
                    <div style={{ marginTop: 6 }}>The reasoning for this trade is no longer in the recent log.</div>
                  ) : null}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {rows.length > limit && (
        <button
          onClick={() => setLimit(limit + 25)}
          style={{ width: "100%", marginTop: 10, background: "transparent", border: "1px solid #30363d", color: "#8b949e", borderRadius: 10, padding: 10, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}
        >
          Show more ({rows.length - limit} left)
        </button>
      )}
    </div>
  );
}

// ─── decisions feed ───────────────────────────────────────────────────────────
function Decisions({ decisions, filter, labels }) {
  const [showSkips, setShowSkips] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(30);

  const rows = decisions.filter((d) => (filter === "all" || d.account === filter) && (showSkips || d.action !== "SKIP"));
  const skipCount = decisions.filter((d) => (filter === "all" || d.account === filter) && d.action === "SKIP").length;

  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#8b949e", fontSize: 11, margin: "0 2px 10px", cursor: "pointer" }}>
        <input type="checkbox" checked={showSkips} onChange={(e) => setShowSkips(e.target.checked)} />
        Also show SKIP answers ({skipCount} recent)
      </label>
      {!rows.length ? (
        <Empty>
          {showSkips
            ? "No decisions logged yet."
            : "No BUY or SELL decisions yet. The models are asked every 15 minutes inside the trading window, and most answers are SKIP."}
        </Empty>
      ) : (
        <div className="fx-cols" style={{ display: "grid", gap: 6 }}>
          {rows.slice(0, limit).map((d) => {
            const open = openId === d.id;
            const col = d.action === "BUY" ? GREEN : d.action === "SELL" ? RED : "#8b949e";
            return (
              <Card key={d.id} onClick={() => setOpenId(open ? null : d.id)} style={{ ...tint(d.account), padding: "10px 13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorOf(d.account), flexShrink: 0 }} />
                    <span style={{ color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{d.pair}</span>
                    <Pill color={col} solid={d.action !== "SKIP"}>{d.action}</Pill>
                    {d.action !== "SKIP" && <span style={{ color: "#8b949e", fontFamily: MONO, fontSize: 10 }}>{d.confidence}%</span>}
                  </div>
                  <span style={{ color: "#8b949e", fontFamily: MONO, fontSize: 10, flexShrink: 0 }}>{clock(d.ts)}</span>
                </div>
                <div style={{ color: "#8b949e", fontSize: 11, marginTop: 5, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{labels[d.account] || d.account}</span>
                  <span style={{ color: d.executed ? GREEN : AMBER }}>
                    {d.executed
                      ? "order placed"
                      : d.action === "SKIP"
                      ? ""
                      : d.mode && d.mode.startsWith("shadow")
                      ? "shadow (no order)"
                      : "not opened"}
                  </span>
                </div>
                {open && (
                  <div style={{ borderTop: "1px solid #21262d", marginTop: 8, paddingTop: 8, fontSize: 11, lineHeight: 1.7, color: "#cdd9e5" }}>
                    <div>{d.reason ? `“${d.reason}”` : d.action === "SKIP" ? "Skipped (no explanation requested)" : "no reason given"}</div>
                    {d.note && <div style={{ color: "#8b949e", marginTop: 4 }}>{d.note}</div>}
                    <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, marginTop: 6 }}>
                      {dayTime(d.ts)} · {d.latencyMs} ms · {d.tokensIn || 0} in / {d.tokensOut || 0} out tokens
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {rows.length > limit && (
        <button
          onClick={() => setLimit(limit + 30)}
          style={{ width: "100%", marginTop: 10, background: "transparent", border: "1px solid #30363d", color: "#8b949e", borderRadius: 10, padding: 10, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}
        >
          Show more
        </button>
      )}
    </div>
  );
}

// ─── screen ───────────────────────────────────────────────────────────────────
export default function Arena({ baselineTrades }) {
  const [data, setData] = useState({ loaded: false });
  const [filter, setFilter] = useState("all");
  const [section, setSection] = useState(() => { try { return sessionStorage.getItem("arenaSection") || "overview"; } catch { return "overview"; } });
  const pickSection = (id) => { setSection(id); try { sessionStorage.setItem("arenaSection", id); } catch {} };
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    const [status, lb, open, trades, decisions, balances, baseline] = await Promise.all([
      get("/api/arena/status"),
      get("/api/arena/leaderboard"),
      get("/api/arena/open"),
      get("/api/arena/trades?limit=1000"),
      get("/api/arena/decisions?limit=500"),
      get("/api/arena/balances"),
      get("/api/arena/baseline"),
    ]);
    setData({ loaded: true, status, lb, open: open || [], trades: trades || [], decisions: decisions || [], balances: Array.isArray(balances) ? balances : [], baseline: baseline && baseline.source === "binance" ? baseline.trades : null });
    if (status) setUpdated(new Date());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const { status, lb } = data;
  const since = lb?.since || status?.arenaStart || null;

  // closed trades of every account, newest first (models + baseline)
  const trades = useMemo(() => {
    const models = (data.trades || []).map((t) => ({ ...t, pnl: num(t.pnl) }));
    const sinceMs = since ? new Date(since).getTime() : 0;
    // preferred: the baseline's trades as Binance reports them (fees included); fallback: the app's own log
    const fromBinance = data.baseline
      ? data.baseline.map((t) => ({
          account: "baseline", label: "Baseline", pair: t.pair, direction: t.direction,
          entryPrice: null, closePrice: t.closePrice, pnl: num(t.pnl), reason: t.reason,
          openTime: null, closeTime: t.closeTime, peakProfit: null, decisionId: null,
        }))
      : null;
    const base = fromBinance || (baselineTrades || [])
      .filter((t) => (t.assetClass || "CRYPTO") === "CRYPTO" && new Date(t.closeTime || 0).getTime() >= sinceMs)
      .map((t) => ({
        account: "baseline",
        label: "Baseline",
        pair: t.pair,
        direction: t.direction || t.side || (t.type === "SELL" ? "SELL" : "BUY"),
        entryPrice: t.entry ?? t.entryPrice,
        closePrice: t.exit ?? t.closePrice,
        pnl: num(t.pnl),
        reason: t.reason,
        openTime: t.openTime || null,
        closeTime: t.closeTime,
        peakProfit: null,
        decisionId: null,
      }));
    return [...models, ...base].sort((a, b) => new Date(b.closeTime) - new Date(a.closeTime));
  }, [data.trades, data.baseline, baselineTrades, since]);

  // one cumulative-PnL line per account
  const series = useMemo(() => {
    const t0 = since ? new Date(since).getTime() : Date.now();
    const keys = (lb?.rows || []).map((r) => r.account);
    return keys
      .map((k) => {
        const row = lb.rows.find((r) => r.account === k);
        const mine = trades.filter((t) => t.account === k).sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
        let run = 0;
        const points = [{ t: t0, v: 0 }];
        for (const t of mine) { run += t.pnl; points.push({ t: new Date(t.closeTime).getTime(), v: +run.toFixed(2) }); }
        return { account: k, label: k === "baseline" ? "Baseline" : row.label, points, final: +run.toFixed(2), live: (row.mode || "").toLowerCase().startsWith("live") || k === "baseline" };
      })
      .filter((s) => s.live)
      .sort((a, b) => ORDER.indexOf(a.account) - ORDER.indexOf(b.account));
  }, [trades, lb, since]);

  const reasons = useMemo(() => Object.fromEntries((data.decisions || []).map((d) => [d.id, d])), [data.decisions]);
  const labels = useMemo(() => {
    const m = {};
    (lb?.rows || []).forEach((r) => { m[r.account] = r.label; });
    return m;
  }, [lb]);
  const wallets = useMemo(() => Object.fromEntries((data.balances || []).map((b) => [b.account, b])), [data.balances]);
  const openCounts = useMemo(() => {
    const c = {};
    (data.open || []).forEach((p) => { c[p.account] = (c[p.account] || 0) + 1; });
    return c;
  }, [data.open]);

  const filterOptions = [
    { id: "all", label: "All", color: "#ff4757" },
    ...ORDER.filter((k) => labels[k]).map((k) => ({ id: k, label: labels[k].replace(" (rules engine)", ""), color: colorOf(k) })),
  ];

  if (!data.loaded) {
    return <div style={{ color: "#8b949e", fontFamily: MONO, fontSize: 12, padding: "40px 0", textAlign: "center" }}>Loading arena…</div>;
  }
  if (!status) {
    return <Empty>Can't reach the server right now. It retries automatically every few seconds.</Empty>;
  }
  if (!status.enabled) {
    return <Empty>The arena is switched off on the server (ARENA_ENABLED is not true).</Empty>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ color: "#fff", fontFamily: BEBAS, fontSize: 26, letterSpacing: 3 }}>THE ARENA</div>
        <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9 }}>{updated ? `updated ${clock(updated.toISOString())}` : ""}</div>
      </div>
      <div style={{ color: "#8b949e", fontSize: 12, margin: "2px 0 12px", lineHeight: 1.5 }}>
        Same market data, same stop and target, one Binance account per model. Profit is realised and after fees.
      </div>

      <StatusStrip status={status} />

      <div role="tablist" style={{ display: "flex", gap: 6, overflowX: "auto", margin: "14px 0 4px", paddingBottom: 2 }}>
        {[
          { id: "overview", label: "Overview", n: data.open.length ? `${data.open.length} open` : "" },
          { id: "charts", label: "Charts" },
          { id: "trades", label: "Trades", n: trades.length ? String(trades.length) : "" },
          { id: "decisions", label: "Decisions" },
        ].map((t) => {
          const on = section === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={on} onClick={() => pickSection(t.id)} style={{
              flexShrink: 0, cursor: "pointer", fontFamily: MONO, fontSize: 11, padding: "8px 14px", borderRadius: 18,
              background: on ? "#ff475718" : "#0d1117", border: `1px solid ${on ? "#ff4757" : "#30363d"}`,
              color: on ? "#ff4757" : "#8b949e", fontWeight: on ? 700 : 400,
            }}>
              {t.label}{t.n ? <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 9 }}>{t.n}</span> : null}
            </button>
          );
        })}
      </div>

      {section === "overview" && (
        <>
          <SectionTitle>LEAGUE TABLE</SectionTitle>
          <LeagueTable rows={lb?.rows || []} trades={trades} />

          <SectionTitle>STANDINGS</SectionTitle>
          <Leaderboard rows={lb?.rows || []} openCounts={openCounts} wallets={wallets} />

          <SectionTitle right={<span style={{ color: "#8b949e", fontFamily: MONO, fontSize: 10 }}>{data.open.length} open</span>}>OPEN NOW</SectionTitle>
          <OpenPositions open={data.open} />
        </>
      )}

      {section === "charts" && (
        <>
          <SectionTitle>PROFIT OVER TIME</SectionTitle>
          <EquityChart series={series} start={since} />

          <SectionTitle>DAILY · WEEKLY · MONTHLY</SectionTitle>
          <ArenaCharts trades={trades} labels={labels} />
        </>
      )}

      {section === "trades" && (
        <>
          <SectionTitle>TRADES</SectionTitle>
          <Chips options={filterOptions} value={filter} onChange={setFilter} />
          <div style={{ height: 10 }} />
          <Trades trades={trades} reasons={reasons} filter={filter} />
        </>
      )}

      {section === "decisions" && (
        <>
          <SectionTitle>MODEL DECISIONS</SectionTitle>
          <Chips options={filterOptions} value={filter} onChange={setFilter} />
          <div style={{ height: 10 }} />
          <Decisions decisions={data.decisions || []} filter={filter} labels={labels} />
        </>
      )}
    </div>
  );
}
