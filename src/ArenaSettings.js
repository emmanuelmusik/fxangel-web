import React, { useState, useEffect, useCallback } from "react";

// ─── ARENA SETTINGS ───────────────────────────────────────────────────────────
// Locked panel on the Settings screen. Changes are sent to /api/arena/settings;
// the backend checks the password, enforces hard limits and saves the values.
// New values apply to the NEXT trade, never to trades that are already open.

const MONO = "'Space Mono', monospace";
const GREEN = "#00e5a0";
const RED = "#ff4757";
const AMBER = "#ffa502";
const PURPLE = "#a371f7";
const PW_KEY = "fxangel_settings_pw";

const MODEL_ORDER = ["claude", "grok", "gemini", "openai"];
const MODEL_COLORS = { claude: "#e8a05a", grok: "#c9d1d9", gemini: "#6ea8ff", openai: "#b583ff" };
const MODEL_SUGGESTIONS = {
  anthropic: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
  xai: ["grok-4-fast"],
  gemini: ["gemini-2.5-flash", "gemini-3.8-flash"],
  openai: ["gpt-5-mini"],
};
const NUM_FIELDS = [
  ["marginUsd", "Margin ($)"],
  ["leverage", "Leverage (x)"],
  ["slMinPct", "SL min (%)"],
  ["slMaxPct", "SL max (%)"],
  ["tpMinPct", "TP min (%)"],
  ["tpMaxPct", "TP max (%)"],
];

const BASE_ORDER = ["BTCUSDT", "ETHUSDT", "DOGEUSDT", "BNBUSDT", "ADAUSDT", "SOLUSDT", "XRPUSDT", "LTCUSDT", "AVAXUSDT"];
const BASE_FIELDS = [
  ["tradeUsd", "Margin ($)"],
  ["leverage", "Leverage (x)"],
  ["slUsd", "SL ($)"],
  ["tpUsd", "TP ($)"],
];
const FEE_SIDE = 0.0005;   // Binance taker fee per side, same figure the bot uses for break-even

const card = { background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 14, marginBottom: 12 };
const label = { color: "#8b949e", fontSize: 9, fontFamily: MONO, marginBottom: 4 };
const input = {
  width: "100%", padding: "8px 10px", background: "#010409", border: "1px solid #21262d",
  borderRadius: 8, color: "#fff", fontFamily: MONO, fontSize: 12, boxSizing: "border-box", colorScheme: "dark",
};
const btn = (color, solid) => ({
  padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontFamily: MONO, fontSize: 11, fontWeight: 700,
  background: solid ? color : `${color}15`, border: `1px solid ${solid ? color : color + "50"}`, color: solid ? "#010409" : color,
});

const hh = (h) => String(((h % 24) + 24) % 24).padStart(2, "0") + ":00";

function toForm(d) {
  const models = {};
  for (const k of MODEL_ORDER) {
    const m = d.models[k];
    if (!m) continue;
    models[k] = {
      enabled: !!m.enabled, modelId: m.modelId || "",
      marginUsd: String(m.marginUsd), leverage: String(m.leverage),
      slMinPct: String(m.slMinPct), slMaxPct: String(m.slMaxPct),
      tpMinPct: String(m.tpMinPct), tpMaxPct: String(m.tpMaxPct),
    };
  }
  const baseline = {};
  for (const sym of BASE_ORDER) {
    const b = (d.baseline || {})[sym];
    if (!b) continue;
    const nom = b.tradeUsd * b.leverage;
    const r2 = (n) => String(Math.round(n * 100) / 100);
    baseline[sym] = {
      trading: !b.paused, tradeUsd: String(b.tradeUsd), leverage: String(b.leverage),
      pctMode: b.slPct != null,
      slUsd: r2(b.slUsd), tpUsd: r2(b.tpUsd),
      slPct: b.slPct != null ? String(b.slPct) : r2(b.slUsd / nom * 100),
      tpPct: b.tpPct != null ? String(b.tpPct) : r2(b.tpUsd / nom * 100),
    };
  }
  const g = d.global;
  const allDay = g.entryFromUtc === 0 && g.entryUntilUtc === 24;
  return {
    models,
    baseline,
    allDay,
    fromG: (g.entryFromUtc + 1) % 24,                 // GMT+1 hour entries start
    untilG: ((g.entryUntilUtc + 1 - 1) % 24) + 1,     // GMT+1 hour entries stop (1-24)
    sunday: !!g.sundayBlock,
    pairs: [...g.arenaPairs],
  };
}

export default function ArenaSettings({ apiBase }) {
  const [pw, setPw] = useState(() => { try { return sessionStorage.getItem(PW_KEY) || ""; } catch { return ""; } });
  const [unlocked, setUnlocked] = useState(false);
  const [typed, setTyped] = useState("");
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);       // { ok, text }
  const [busy, setBusy] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);   // Baseline card folded by default

  const post = useCallback(async (path, body) => {
    const r = await fetch(`${apiBase}/api/arena${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let j = {};
    try { j = await r.json(); } catch { /* keep {} */ }
    return { status: r.status, body: j };
  }, [apiBase]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/arena/settings`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d); setForm(toForm(d));
    } catch (e) { setMsg({ ok: false, text: `Could not load settings (${e.message})` }); }
  }, [apiBase]);

  // a saved password from this browser session unlocks automatically
  useEffect(() => {
    if (!pw) return;
    (async () => {
      const r = await post("/settings/login", { password: pw });
      if (r.status === 200) { setUnlocked(true); load(); }
      else { try { sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ } setPw(""); }
    })();
  }, []);

  const unlock = async () => {
    setBusy(true); setMsg(null);
    const r = await post("/settings/login", { password: typed });
    setBusy(false);
    if (r.status === 200) {
      try { sessionStorage.setItem(PW_KEY, typed); } catch { /* ignore */ }
      setPw(typed); setTyped(""); setUnlocked(true); load();
    } else {
      setMsg({ ok: false, text: r.body.error || "Could not unlock" });
    }
  };

  const lock = () => {
    try { sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ }
    setPw(""); setUnlocked(false); setData(null); setForm(null); setMsg(null);
  };

  const setModel = (k, f, v) => setForm((s) => ({ ...s, models: { ...s.models, [k]: { ...s.models[k], [f]: v } } }));

  // switch a coin between fixed dollars and fixed percent, carrying the current numbers across
  const setBaseMode = (sym, pctMode) => setForm((s) => {
    const f = s.baseline[sym];
    if (!!f.pctMode === pctMode) return s;
    const nom = parseFloat(f.tradeUsd) * parseFloat(f.leverage);
    const r2 = (n) => String(Math.round(n * 100) / 100);
    const next = { ...f, pctMode };
    if (Number.isFinite(nom) && nom > 0) {
      if (pctMode) { next.slPct = r2(parseFloat(f.slUsd) / nom * 100); next.tpPct = r2(parseFloat(f.tpUsd) / nom * 100); }
      else { next.slUsd = r2(parseFloat(f.slPct) * nom / 100); next.tpUsd = r2(parseFloat(f.tpPct) * nom / 100); }
    }
    return { ...s, baseline: { ...s.baseline, [sym]: next } };
  });
  const setBase = (sym, f, v) => setForm((s) => ({ ...s, baseline: { ...s.baseline, [sym]: { ...s.baseline[sym], [f]: v } } }));

  // only what the user actually changed
  const buildPatch = () => {
    const patch = { models: {}, global: {}, baseline: {} };
    for (const sym of BASE_ORDER) {
      const cur = (data.baseline || {})[sym], f = form.baseline[sym];
      if (!cur || !f) continue;
      const p = {};
      if (f.trading !== !cur.paused) p.paused = !f.trading;
      const pctNow = cur.slPct != null;
      for (const [name] of BASE_FIELDS) {
        if (f.pctMode && (name === "slUsd" || name === "tpUsd")) continue;   // percent mode: dollars follow the size
        if (!f.pctMode && pctNow && (name === "slUsd" || name === "tpUsd")) continue;   // set explicitly below
        const n = parseFloat(f[name]);
        if (n !== cur[name]) p[name] = Number.isFinite(n) ? n : f[name];
      }
      if (f.pctMode) {
        for (const name of ["slPct", "tpPct"]) {
          const n = parseFloat(f[name]);
          if (!pctNow || n !== cur[name]) p[name] = Number.isFinite(n) ? n : f[name];
        }
      } else if (pctNow) {
        p.slPct = null; p.tpPct = null;                                      // back to fixed dollars
        for (const name of ["slUsd", "tpUsd"]) { const n = parseFloat(f[name]); p[name] = Number.isFinite(n) ? n : f[name]; }
      }
      if (Object.keys(p).length) patch.baseline[sym] = p;
    }
    for (const k of MODEL_ORDER) {
      const cur = data.models[k], f = form.models[k];
      if (!cur || !f) continue;
      const p = {};
      if (f.enabled !== !!cur.enabled) p.enabled = f.enabled;
      if (f.modelId.trim() && f.modelId.trim() !== cur.modelId) p.modelId = f.modelId.trim();
      for (const [name] of NUM_FIELDS) {
        const n = parseFloat(f[name]);
        if (n !== cur[name]) p[name] = Number.isFinite(n) ? n : f[name];
      }
      if (Object.keys(p).length) patch.models[k] = p;
    }
    const g = data.global;
    let from, until;
    if (form.allDay) { from = 0; until = 24; }
    else { from = (form.fromG + 23) % 24; until = (form.untilG + 23) % 24 }
    if (from !== g.entryFromUtc) patch.global.entryFromUtc = from;
    if (until !== g.entryUntilUtc) patch.global.entryUntilUtc = until;
    if (form.sunday !== g.sundayBlock) patch.global.sundayBlock = form.sunday;
    const a = [...form.pairs].sort().join(","), b = [...g.arenaPairs].sort().join(",");
    if (a !== b) patch.global.arenaPairs = form.pairs;
    return patch;
  };

  const save = async (patchOverride) => {
    setMsg(null);
    if (!patchOverride && !form.allDay && form.fromG === form.untilG) {
      setMsg({ ok: false, text: "Start and end hour are the same. Tick 'Allow all day' or pick different hours." });
      return;
    }
    const patch = patchOverride || buildPatch();
    if (!Object.keys(patch.models || {}).length && !Object.keys(patch.global || {}).length && !Object.keys(patch.baseline || {}).length) {
      setMsg({ ok: true, text: "Nothing changed." }); return;
    }
    setBusy(true);
    const r = await post("/settings", { password: pw, patch });
    setBusy(false);
    if (r.status === 200) {
      setData(r.body); setForm(toForm(r.body));
      setMsg({ ok: true, text: "Saved. New values apply from the next trade; open trades are not touched." });
    } else if (r.status === 403) {
      lock(); setMsg({ ok: false, text: "Password no longer accepted — unlock again." });
    } else {
      setMsg({ ok: false, text: r.body.error || `Save failed (HTTP ${r.status})` });
    }
  };

  const resetModel = (k) => {
    if (!window.confirm(`Reset ${data.models[k].label} to its default settings?`)) return;
    save({ models: { [k]: { enabled: null, modelId: null, marginUsd: null, leverage: null, slMinPct: null, slMaxPct: null, tpMinPct: null, tpMaxPct: null } }, global: {} });
  };

  const resetBase = (sym) => {
    if (!window.confirm(`Reset ${data.baseline[sym].pair} baseline rules to the defaults?`)) return;
    save({ models: {}, global: {}, baseline: { [sym]: { tradeUsd: null, leverage: null, slUsd: null, tpUsd: null, paused: null } } });
  };

  // ─── locked ───
  if (!unlocked) {
    return (
      <div style={card}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🔒 Trading Settings</div>
        <div style={{ color: "#8b949e", fontSize: 10, fontFamily: MONO, marginBottom: 10 }}>
          Margin, leverage, SL/TP limits, models, trading hours. Enter the password to open.
        </div>
        <input
          type="password" value={typed} placeholder="Password" autoComplete="current-password"
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()}
          style={{ ...input, marginBottom: 10 }}
        />
        <button onClick={unlock} disabled={busy || !typed} style={{ ...btn(GREEN, true), opacity: busy || !typed ? 0.5 : 1 }}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        {msg && <div style={{ color: msg.ok ? GREEN : RED, fontSize: 10, fontFamily: MONO, marginTop: 10 }}>{msg.text}</div>}
      </div>
    );
  }

  if (!form || !data) {
    return <div style={card}><div style={{ color: "#8b949e", fontSize: 11, fontFamily: MONO }}>Loading settings…{msg ? ` ${msg.text}` : ""}</div></div>;
  }

  const levMax = data.bounds.leverage[1];
  const gate = data.gateNow;

  return (
    <div>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>🔓 Trading Settings</div>
          <div style={{ color: gate?.blocked ? AMBER : GREEN, fontSize: 10, fontFamily: MONO, marginTop: 4 }}>
            {gate?.blocked ? `Entries paused now: ${gate.reason}` : "Entries allowed right now"}
          </div>
        </div>
        <button onClick={lock} style={btn("#8b949e")}>Lock</button>
      </div>

      {!data.freeRisk && (
        <div style={{ ...card, borderColor: AMBER, color: AMBER, fontSize: 10, fontFamily: MONO }}>
          ARENA_FREE_RISK is switched off on the server, so the models use the fixed per-pair rules and the margin, leverage and SL/TP boxes below have no effect.
        </div>
      )}

      {/* per model */}
      {MODEL_ORDER.map((k) => {
        const m = data.models[k], f = form.models[k];
        if (!m || !f) return null;
        const c = MODEL_COLORS[k];
        const margin = parseFloat(f.marginUsd), lev = parseFloat(f.leverage);
        const notional = Number.isFinite(margin) && Number.isFinite(lev) ? margin * lev : null;
        const btcMargin = Number.isFinite(lev) && lev > 0 ? Math.max(margin || 0, Math.ceil((105 / lev) * 100) / 100) : null;
        const listId = `models-${k}`;
        return (
          <div key={k} style={{ ...card, borderLeft: `3px solid ${c}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span style={{ color: c, fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                {!m.keyPresent && <span style={{ color: AMBER, fontSize: 9, fontFamily: MONO, marginLeft: 8 }}>no API key on server</span>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: f.enabled ? GREEN : "#8b949e", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={f.enabled} onChange={(e) => setModel(k, "enabled", e.target.checked)} />
                {f.enabled ? "Trading" : "Paused"}
              </label>
            </div>

            <div style={label}>MODEL ID</div>
            <input
              style={{ ...input, marginBottom: 10 }} value={f.modelId} list={listId}
              onChange={(e) => setModel(k, "modelId", e.target.value)}
            />
            <datalist id={listId}>{(MODEL_SUGGESTIONS[m.provider] || []).map((s) => <option key={s} value={s} />)}</datalist>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {NUM_FIELDS.map(([name, text]) => {
                const isSl = name.startsWith("sl"), isTp = name.startsWith("tp");
                const pct = parseFloat(f[name]);
                const usd = (isSl || isTp) && notional != null && Number.isFinite(pct) ? notional * pct / 100 : null;
                return (
                  <div key={name}>
                    <div style={label}>{text.toUpperCase()}{name === "leverage" ? ` · MAX ${levMax}` : ""}</div>
                    <input
                      style={input} inputMode="decimal" value={f[name]}
                      onChange={(e) => setModel(k, name, e.target.value)}
                    />
                    {usd != null && (
                      <div style={{ color: isSl ? "#f85149" : GREEN, fontSize: 10, fontFamily: MONO, marginTop: 4 }}>
                        {isSl ? "≈ -" : "≈ +"}${usd.toFixed(usd < 0.1 ? 3 : 2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ color: "#8b949e", fontSize: 9, fontFamily: MONO, marginTop: 10, lineHeight: 1.6 }}>
              {notional != null && <>Position ≈ ${notional.toFixed(0)} · fees ≈ ${(notional * 0.001).toFixed(2)} per round trip<br /></>}
              {notional != null && <>SL/TP dollar amounts are before fees (a win nets TP minus fees, a loss is SL plus fees)<br /></>}
              {btcMargin != null && <>BTC has a ~$100 minimum order, so it uses about ${btcMargin.toFixed(2)} margin<br /></>}
              Default: ${m.defaults.marginUsd} at {m.defaults.leverage}x
            </div>

            <div style={{ marginTop: 10 }}>
              <button onClick={() => resetModel(k)} style={{ ...btn("#8b949e"), padding: "6px 10px", fontSize: 9 }}>Reset {m.label} to defaults</button>
            </div>
          </div>
        );
      })}

      {/* baseline */}
      <div style={card}>
        <div
          onClick={() => setBaseOpen((o) => !o)} role="button" aria-expanded={baseOpen}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        >
          <div>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>📊 Baseline (main account)</div>
            {!baseOpen && (
              <div style={{ color: "#8b949e", fontSize: 9, fontFamily: MONO, marginTop: 4 }}>
                {BASE_ORDER.filter((sym) => form.baseline[sym]?.trading).length} of {Object.keys(form.baseline).length} coins trading · tap to open
              </div>
            )}
          </div>
          <span style={{ color: "#8b949e", fontSize: 14, fontFamily: MONO }}>{baseOpen ? "▲" : "▼"}</span>
        </div>
        {baseOpen && (
          <div style={{ color: "#8b949e", fontSize: 9, fontFamily: MONO, margin: "8px 0 4px", lineHeight: 1.6 }}>
            Rules for the main-account bot, per coin. SL and TP are either fixed dollars on the position or a fixed % of price (then the dollars grow with the size, like the AI models). New values apply from the next baseline trade; open trades keep the stop and target already on Binance.
          </div>
        )}
        {baseOpen && BASE_ORDER.map((sym) => {
          const b = (data.baseline || {})[sym], f = form.baseline[sym];
          if (!b || !f) return null;
          const margin = parseFloat(f.tradeUsd), lev = parseFloat(f.leverage);
          const inPct = !!f.pctMode;
          const slIn = parseFloat(inPct ? f.slPct : f.slUsd), tpIn = parseFloat(inPct ? f.tpPct : f.tpUsd);
          const ok = [margin, lev, slIn, tpIn].every(Number.isFinite) && margin > 0 && lev > 0;
          const notional = ok ? margin * lev : null;
          const sl = ok ? (inPct ? notional * slIn / 100 : slIn) : null, tp = ok ? (inPct ? notional * tpIn / 100 : tpIn) : null;
          const slPct = ok ? sl / notional * 100 : null, tpPct = ok ? tp / notional * 100 : null;
          const cost = ok ? 2 * FEE_SIDE * notional : null;
          const be = ok && tp - cost > 0 ? (sl + cost) / ((tp - cost) + (sl + cost)) * 100 : null;
          return (
            <div key={sym} style={{ borderTop: "1px solid #21262d", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: "#fff", fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{b.pair}</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, color: f.trading ? GREEN : "#8b949e", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={f.trading} onChange={(e) => setBase(sym, "trading", e.target.checked)} />
                  {f.trading ? "Trading" : "Paused"}
                </label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ ...label, marginBottom: 0 }}>STOP / TARGET IN</span>
                {[[false, "Dollars $"], [true, "Percent %"]].map(([m, text]) => (
                  <button key={text} onClick={() => setBaseMode(sym, m)} aria-pressed={inPct === m} style={{
                    cursor: "pointer", fontFamily: MONO, fontSize: 10, padding: "5px 10px", borderRadius: 8,
                    background: inPct === m ? "#21262d" : "transparent", color: inPct === m ? "#fff" : "#8b949e",
                    border: `1px solid ${inPct === m ? "#8b949e" : "#30363d"}`, fontWeight: inPct === m ? 700 : 400,
                  }}>{text}</button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {BASE_FIELDS.map(([name, text]) => {
                  const pctName = name === "slUsd" ? "slPct" : name === "tpUsd" ? "tpPct" : null;
                  if (pctName && inPct) {
                    const isSl = name === "slUsd";
                    return (
                      <div key={pctName}>
                        <div style={label}>{isSl ? "SL (% OF PRICE)" : "TP (% OF PRICE)"}</div>
                        <input style={input} inputMode="decimal" value={f[pctName]} onChange={(e) => setBase(sym, pctName, e.target.value)} />
                        {ok && <div style={{ color: isSl ? RED : GREEN, fontSize: 10, fontFamily: MONO, marginTop: 4 }}>≈ ${(isSl ? sl : tp).toFixed(2)} on this position</div>}
                      </div>
                    );
                  }
                  return (
                  <div key={name}>
                    <div style={label}>{text.toUpperCase()}{name === "leverage" ? ` · MAX ${data.baselineBounds?.leverage?.[1] ?? 125}` : ""}</div>
                    <input style={input} inputMode="decimal" value={f[name]} onChange={(e) => setBase(sym, name, e.target.value)} />
                    {ok && name === "slUsd" && <div style={{ color: RED, fontSize: 10, fontFamily: MONO, marginTop: 4 }}>≈ {slPct.toFixed(2)}% price move</div>}
                    {ok && name === "tpUsd" && <div style={{ color: GREEN, fontSize: 10, fontFamily: MONO, marginTop: 4 }}>≈ {tpPct.toFixed(2)}% price move</div>}
                  </div>
                  );
                })}
              </div>
              <div style={{ color: "#8b949e", fontSize: 9, fontFamily: MONO, marginTop: 8, lineHeight: 1.6 }}>
                {ok && <>Position ≈ ${notional.toFixed(0)} · fees ≈ ${cost.toFixed(2)} per round trip · reward:risk 1:{(tp / sl).toFixed(2)}{be != null ? ` · break-even win rate ≈ ${be.toFixed(0)}%` : " · TP is smaller than the fees, so every win loses money"}<br /></>}
                Default: ${b.defaults.tradeUsd} at {b.defaults.leverage}x, SL ${b.defaults.slUsd} / TP ${b.defaults.tpUsd}, {b.defaults.paused ? "paused" : "trading"}
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => resetBase(sym)} style={{ ...btn("#8b949e"), padding: "6px 10px", fontSize: 9 }}>Reset {b.pair} to defaults</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* trading window */}
      <div style={card}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🕒 Trading window</div>
        <div style={{ color: AMBER, fontSize: 9, fontFamily: MONO, marginBottom: 10 }}>
          Applies to the baseline bot and all models. All times are GMT+1.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontFamily: MONO, fontSize: 11, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((s) => ({ ...s, allDay: e.target.checked }))} />
          Allow entries all day
        </label>
        {!form.allDay && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>ENTRIES FROM</div>
              <select style={input} value={form.fromG} onChange={(e) => setForm((s) => ({ ...s, fromG: parseInt(e.target.value, 10) }))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>ENTRIES UNTIL</div>
              <select style={input} value={form.untilG} onChange={(e) => setForm((s) => ({ ...s, untilG: parseInt(e.target.value, 10) }))}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h === 24 ? "24:00" : hh(h)}</option>)}
              </select>
            </div>
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
          <input type="checkbox" checked={form.sunday} onChange={(e) => setForm((s) => ({ ...s, sunday: e.target.checked }))} />
          Block Sundays
        </label>
        <div style={{ color: "#5a6573", fontSize: 9, fontFamily: MONO, marginTop: 8 }}>
          High-impact news pauses (±60 min) are fixed. Open trades are never closed by the window.
        </div>
      </div>

      {/* pairs */}
      <div style={card}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🪙 Pairs the models trade</div>
        <div style={{ color: "#8b949e", fontSize: 9, fontFamily: MONO, marginBottom: 10 }}>
          Fewer pairs means fewer model calls (lower cost).
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.allowedPairs.map((p) => {
            const on = form.pairs.includes(p);
            return (
              <button key={p} onClick={() => setForm((s) => ({ ...s, pairs: on ? s.pairs.filter((x) => x !== p) : [...s.pairs, p] }))}
                style={{
                  padding: "7px 10px", borderRadius: 10, cursor: "pointer", fontFamily: MONO, fontSize: 10, fontWeight: 700,
                  background: on ? `${PURPLE}20` : "#010409", border: `1px solid ${on ? PURPLE : "#21262d"}`, color: on ? PURPLE : "#8b949e",
                }}>{p.replace("/USD", "")}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <button onClick={() => save()} disabled={busy} style={{ ...btn(GREEN, true), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save changes"}</button>
        <button onClick={() => { setForm(toForm(data)); setMsg(null); }} style={btn("#8b949e")}>Undo edits</button>
      </div>
      {msg && <div style={{ color: msg.ok ? GREEN : RED, fontSize: 10, fontFamily: MONO, marginTop: 6, lineHeight: 1.5 }}>{msg.text}</div>}
      <div style={{ color: "#5a6573", fontSize: 9, fontFamily: MONO, marginTop: 10, lineHeight: 1.6 }}>
        Changes apply to the next trade only. A wrong model ID makes that model skip every round until fixed.
        Binance caps new sub-accounts at {levMax}x leverage, and each pair has a minimum order size, which can raise the margin a little.
      </div>
    </div>
  );
}
