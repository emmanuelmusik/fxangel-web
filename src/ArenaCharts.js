import React, { useMemo, useState } from "react";

// ─── PROFIT BY DAY / WEEK / MONTH, one chart per model ───────────────────────
// Built only from the closed-trade records the Arena screen already loads (Binance
// figures, fees included). Periods are cut in GMT+1, the clock the rest of the app uses.
// Gain/loss is shown by bar direction (above / below the zero line) as well as colour.

const MONO = "'Space Mono', monospace";
const GREEN = "#00e5a0";
const RED = "#ff4757";
const MUTED = "#8b949e";
const COLORS = { claude: "#e8a05a", grok: "#c9d1d9", gemini: "#6ea8ff", openai: "#b583ff", baseline: "#8b949e" };
const ORDER = ["claude", "grok", "gemini", "openai", "baseline"];

const DAY = 86400000;
const SHIFT = 3600000; // GMT+1
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KINDS = [
  { id: "day", label: "Daily", cap: 30 },
  { id: "week", label: "Weekly", cap: 26 },
  { id: "month", label: "Monthly", cap: 12 },
];

const money = (n, digits = 2) => {
  if (n == null || !Number.isFinite(n)) return "–";
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}$${Math.abs(r).toFixed(digits)}`;
};
const signColor = (n) => (Math.round(n * 100) > 0 ? GREEN : Math.round(n * 100) < 0 ? RED : MUTED);

// ─── period maths (all in the GMT+1 frame, held as UTC-midnight milliseconds) ─
function startOf(ms, kind) {
  const d = new Date(ms + SHIFT);
  let s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (kind === "week") s -= ((d.getUTCDay() + 6) % 7) * DAY;          // weeks start on Monday
  if (kind === "month") s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return s;
}
function nextStart(s, kind) {
  if (kind === "month") { const d = new Date(s); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  return s + (kind === "week" ? 7 : 1) * DAY;
}
function prevStart(s, kind) {
  if (kind === "month") { const d = new Date(s); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1); }
  return s - (kind === "week" ? 7 : 1) * DAY;
}
function shortLabel(s, kind) {
  const d = new Date(s);
  if (kind === "month") return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
function longLabel(s, kind) {
  const d = new Date(s);
  if (kind === "month") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (kind === "week") return `Week of ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// trades: [{ closeTime, pnl }]; returns one bucket per period, empty periods included
export function buildBuckets(trades, kind, nowMs = Date.now()) {
  const cap = (KINDS.find((k) => k.id === kind) || KINDS[0]).cap;
  const rows = (trades || []).filter((t) => t && Number.isFinite(new Date(t.closeTime).getTime()));
  if (!rows.length) return [];
  const firstMs = Math.min(...rows.map((t) => new Date(t.closeTime).getTime()));
  const last = startOf(nowMs, kind);
  let first = startOf(firstMs, kind);
  const keep = [];
  for (let s = last; keep.length < cap && s >= first; s = prevStart(s, kind)) keep.unshift(s);
  first = keep[0];
  const map = new Map(keep.map((s) => [s, { start: s, net: 0, n: 0, w: 0, l: 0 }]));
  for (const t of rows) {
    const b = map.get(startOf(new Date(t.closeTime).getTime(), kind));
    if (!b) continue;
    const p = Number(t.pnl) || 0;
    b.net += p; b.n += 1;
    if (Math.round(p * 100) > 0) b.w += 1; else if (Math.round(p * 100) < 0) b.l += 1;
  }
  return keep.map((s) => { const b = map.get(s); return { ...b, net: +b.net.toFixed(2) }; });
}

export function summarize(trades) {
  let net = 0, w = 0, l = 0;
  for (const t of trades) {
    const p = Number(t.pnl) || 0;
    net += p;
    if (Math.round(p * 100) > 0) w++; else if (Math.round(p * 100) < 0) l++;
  }
  return { net: +net.toFixed(2), n: trades.length, w, l, rate: w + l ? Math.round((w / (w + l)) * 100) : null };
}

// column with the data end rounded (4px) and the baseline end square
function barPath(x, w, y0, y1, r) {
  const up = y1 < y0;
  const top = Math.min(y0, y1), bot = Math.max(y0, y1);
  const h = bot - top;
  const rr = Math.min(r, h, w / 2);
  if (up) return `M${x},${bot} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${bot} Z`;
  return `M${x},${top} V${bot - rr} Q${x},${bot} ${x + rr},${bot} H${x + w - rr} Q${x + w},${bot} ${x + w},${bot - rr} V${top} Z`;
}

const niceTicks = (lo, hi) => {
  const span = hi - lo;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
};

// ─── one chart ───────────────────────────────────────────────────────────────
function BarChart({ buckets, kind, name }) {
  const [sel, setSel] = useState(null);
  const W = 440, H = 150, PL = 40, PR = 6, PT = 10, PB = 22;
  const n = buckets.length;
  const nets = buckets.map((b) => b.net);
  let lo = Math.min(0, ...nets), hi = Math.max(0, ...nets);
  if (hi - lo < 0.5) { hi += 0.25; lo -= 0.25; }
  const pad = (hi - lo) * 0.08;
  lo -= lo < 0 ? pad : 0; hi += hi > 0 ? pad : 0;
  const y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const slot = (W - PL - PR) / n;
  const bw = Math.min(24, Math.max(3, slot * 0.62));
  const ticks = niceTicks(lo, hi);
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  let dflt = n - 1;
  while (dflt > 0 && !buckets[dflt].n) dflt--;
  const curIdx = sel == null ? dflt : sel;
  const cur = buckets[curIdx];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", touchAction: "manipulation" }} role="img"
        aria-label={`${name}: profit per ${kind}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#484f58" : "#21262d"} strokeWidth="1" />
            <text x={PL - 6} y={y(v) + 3} textAnchor="end" fill={MUTED} fontSize="9" fontFamily={MONO}>
              {v < 0 ? "−" : ""}${Math.abs(v).toFixed(Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = PL + slot * i + slot / 2;
          const x0 = cx - bw / 2;
          const on = curIdx === i;
          const y0 = y(0);
          let yv = y(b.net);
          if (b.net !== 0 && Math.abs(yv - y0) < 1.5) yv = y0 + (b.net > 0 ? -1.5 : 1.5);
          return (
            <g key={b.start}>
              {on && <rect x={PL + slot * i} y={PT} width={slot} height={H - PT - PB} fill="#ffffff" opacity="0.05" />}
              {b.net !== 0 ? (
                <path d={barPath(x0, bw, y0, yv, 4)} fill={b.net > 0 ? GREEN : RED} opacity={on ? 1 : 0.82} />
              ) : b.n > 0 ? (
                <line x1={x0} x2={x0 + bw} y1={y0} y2={y0} stroke={MUTED} strokeWidth="2" />
              ) : null}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 7} textAnchor="middle" fill={MUTED} fontSize="9" fontFamily={MONO}>{shortLabel(b.start, kind)}</text>
              )}
              <rect
                x={PL + slot * i} y={PT} width={slot} height={H - PT - PB} fill="transparent" style={{ cursor: "pointer" }}
                tabIndex={0} role="button" aria-label={`${longLabel(b.start, kind)}: ${money(b.net)}, ${b.n} trades`}
                onPointerEnter={() => setSel(i)} onClick={() => setSel(i)} onFocus={() => setSel(i)}
              />
            </g>
          );
        })}
      </svg>
      {cur && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 6, padding: "0 2px", fontFamily: MONO, fontSize: 10 }}>
          <span style={{ color: MUTED }}>{longLabel(cur.start, kind)}</span>
          <span>
            <span style={{ color: signColor(cur.net), fontSize: 13, fontWeight: 700 }}>{cur.n ? money(cur.net) : "no trades"}</span>
            {cur.n > 0 && <span style={{ color: MUTED }}> · {cur.n} trade{cur.n === 1 ? "" : "s"} · {cur.w}W {cur.l}L</span>}
          </span>
        </div>
      )}
    </div>
  );
}

function TableView({ buckets, kind }) {
  const rows = [...buckets].reverse();
  return (
    <div style={{ maxHeight: 260, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 10 }}>
        <thead>
          <tr style={{ color: MUTED, textAlign: "right" }}>
            <th style={{ textAlign: "left", fontWeight: 400, padding: "4px 0" }}>{kind === "day" ? "DAY" : kind === "week" ? "WEEK OF" : "MONTH"}</th>
            <th style={{ fontWeight: 400 }}>TRADES</th><th style={{ fontWeight: 400 }}>W / L</th><th style={{ fontWeight: 400 }}>NET</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.start} style={{ borderTop: "1px solid #161b22", textAlign: "right", color: "#c9d1d9" }}>
              <td style={{ textAlign: "left", padding: "5px 0", color: MUTED }}>{longLabel(b.start, kind).replace("Week of ", "")}</td>
              <td>{b.n}</td><td>{b.w} / {b.l}</td>
              <td style={{ color: b.n ? signColor(b.net) : MUTED, fontWeight: 700 }}>{b.n ? money(b.net) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ color: MUTED, fontFamily: MONO, fontSize: 8, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: color || "#fff", fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const pill = (on) => ({
  background: on ? "#ffffff14" : "transparent", border: `1px solid ${on ? "#8b949e" : "#30363d"}`,
  color: on ? "#fff" : MUTED, borderRadius: 16, padding: "5px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer", flexShrink: 0,
});

// trades: every closed trade (all accounts), labels: account -> display name
export default function ArenaCharts({ trades, labels }) {
  const [kind, setKind] = useState("day");
  const [view, setView] = useState("chart");

  const accounts = useMemo(() => ORDER.filter((k) => labels && labels[k]), [labels]);
  const per = useMemo(() => {
    const out = {};
    for (const k of accounts) {
      const mine = (trades || []).filter((t) => t.account === k);
      out[k] = { mine, buckets: buildBuckets(mine, kind), sum: summarize(mine) };
    }
    return out;
  }, [trades, accounts, kind]);

  const active = accounts.filter((k) => per[k].mine.length);
  const idle = accounts.filter((k) => !per[k].mine.length);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {KINDS.map((k) => <button key={k.id} onClick={() => setKind(k.id)} style={pill(kind === k.id)}>{k.label}</button>)}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setView("chart")} style={pill(view === "chart")}>Chart</button>
          <button onClick={() => setView("table")} style={pill(view === "table")}>Table</button>
        </div>
      </div>

      {active.map((k) => {
        const { buckets, sum } = per[k];
        return (
          <div key={k} style={{ background: "#0d1117", border: "1px solid #21262d", borderLeft: `3px solid ${COLORS[k]}`, borderRadius: 12, padding: "12px 12px 10px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[k] }} />
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>{String(labels[k]).replace(" (rules engine)", "")}</span>
              </span>
              <div style={{ display: "flex", gap: 16 }}>
                <Stat label="NET" value={money(sum.net)} color={signColor(sum.net)} />
                <Stat label="TRADES" value={sum.n} />
                <Stat label="WIN RATE" value={sum.rate == null ? "–" : `${sum.rate}%`} />
              </div>
            </div>
            {view === "chart" ? <BarChart key={`${k}-${kind}`} buckets={buckets} kind={kind} name={labels[k]} /> : <TableView buckets={buckets} kind={kind} />}
          </div>
        );
      })}

      {!active.length && (
        <div style={{ border: "1px dashed #30363d", borderRadius: 12, padding: "22px 16px", textAlign: "center", color: MUTED, fontSize: 12, lineHeight: 1.6 }}>
          No closed trades yet. Charts appear as soon as a model's first trade closes.
        </div>
      )}
      {!!idle.length && !!active.length && (
        <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 10, lineHeight: 1.6 }}>
          No closed trades yet: {idle.map((k) => String(labels[k]).replace(" (rules engine)", "")).join(", ")}
        </div>
      )}
      <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, marginTop: 8, lineHeight: 1.6 }}>
        Profit is realised and after fees. Days, weeks (Monday start) and months are counted in GMT+1. Tap a bar to see its figures.
      </div>
    </div>
  );
}
