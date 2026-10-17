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
  const g = d.global;
  const allDay = g.entryFromUtc === 0 && g.entryUntilUtc === 24;
  return {
    models,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // only what the user actually changed
  const buildPatch = () => {
    const patch = { models: {}, global: {} };
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
    if (!Object.keys(patch.models).length && !Object.keys(patch.global).length) {
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
              {NUM_FIELDS.map(([name, text]) => (
                <div key={name}>
                  <div style={label}>{text.toUpperCase()}{name === "leverage" ? ` · MAX ${levMax}` : ""}</div>
                  <input
                    style={input} inputMode="decimal" value={f[name]}
                    onChange={(e) => setModel(k, name, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div style={{ color: "#8b949e", fontSize: 9, fontFamily: MONO, marginTop: 10, lineHeight: 1.6 }}>
              {notional != null && <>Position ≈ ${notional.toFixed(0)} · fees ≈ ${(notional * 0.001).toFixed(2)} per round trip<br /></>}
              {btcMargin != null && <>BTC has a ~$100 minimum order, so it uses about ${btcMargin.toFixed(2)} margin<br /></>}
              Default: ${m.defaults.marginUsd} at {m.defaults.leverage}x
            </div>

            <div style={{ marginTop: 10 }}>
              <button onClick={() => resetModel(k)} style={{ ...btn("#8b949e"), padding: "6px 10px", fontSize: 9 }}>Reset {m.label} to defaults</button>
            </div>
          </div>
        );
      })}

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
