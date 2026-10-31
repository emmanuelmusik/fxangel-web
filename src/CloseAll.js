import React, { useState, useEffect } from "react";

// "Close all" for the OPEN NOW list: asks for the settings password, then the server
// closes every open trade (models and baseline) at market price.

const MONO = "'Space Mono', monospace";
const GREEN = "#00e5a0";
const RED = "#ff4757";
const MUTED = "#8b949e";
const BASE = process.env.REACT_APP_API_BASE || "https://fxangel-backend-production.up.railway.app";

const money = (n) => (n == null ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`);

export default function CloseAll({ open, onDone }) {
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);       // { ok, text }
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (!show) return undefined;
    const h = (e) => { if (e.key === "Escape" && !busy) setShow(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [show, busy]);

  if (!open.length) return null;

  const total = open.reduce((s, p) => s + (typeof p.unrealizedPnl === "number" ? p.unrealizedPnl : 0), 0);
  const close = () => { if (!busy) { setShow(false); setPw(""); setMsg(null); setResults(null); } };

  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${BASE}/api/arena/close-all`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: body.error || `Server said ${res.status}` });
      } else {
        setResults(body.results || []);
        setPw("");
        if (onDone) onDone();
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server. Nothing was changed that I can confirm: check Binance before trying again." });
    }
    setBusy(false);
  };

  const failed = results ? results.filter((r) => !r.ok) : [];

  return (
    <>
      <button onClick={() => setShow(true)} style={{
        background: "transparent", color: RED, border: `1px solid ${RED}66`, borderRadius: 8,
        fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "5px 10px", cursor: "pointer",
      }}>Close all</button>

      {show && (
        <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(1,4,9,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Close all open trades" style={{
            width: "100%", maxWidth: 420, background: "#0d1117", border: "1px solid #30363d", borderRadius: 14, padding: 16, boxSizing: "border-box", maxHeight: "88vh", overflowY: "auto",
          }}>
            {!results ? (
              <>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Close all open trades?</div>
                <div style={{ color: MUTED, fontSize: 12, lineHeight: 1.6, marginTop: 6 }}>
                  This closes these {open.length} trade{open.length === 1 ? "" : "s"} now at the current market price, on Binance. It cannot be undone.
                </div>
                <div style={{ margin: "12px 0", border: "1px solid #21262d", borderRadius: 10, overflow: "hidden" }}>
                  {open.map((p) => (
                    <div key={`${p.account}-${p.pair}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderBottom: "1px solid #161b22", fontFamily: MONO, fontSize: 11 }}>
                      <span style={{ color: "#cdd9e5" }}>{p.label} · {p.pair} · {p.direction === "BUY" ? "LONG" : "SHORT"}</span>
                      <span style={{ color: p.unrealizedPnl > 0 ? GREEN : p.unrealizedPnl < 0 ? RED : MUTED }}>{money(p.unrealizedPnl)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "#161b22", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: "#fff" }}>Open profit or loss now</span>
                    <span style={{ color: total > 0 ? GREEN : total < 0 ? RED : MUTED }}>{money(total)}</span>
                  </div>
                </div>
                <input
                  type="password" value={pw} placeholder="Settings password" autoComplete="current-password" autoFocus
                  onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pw && !busy && go()}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", background: "#010409", border: "1px solid #30363d", borderRadius: 8, color: "#fff", fontFamily: MONO, fontSize: 13 }}
                />
                {msg && <div style={{ color: msg.ok ? GREEN : RED, fontFamily: MONO, fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>{msg.text}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={close} disabled={busy} style={{ flex: 1, background: "transparent", color: MUTED, border: "1px solid #30363d", borderRadius: 8, padding: "11px", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>Cancel</button>
                  <button onClick={go} disabled={busy || !pw} style={{ flex: 1.4, background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: busy || !pw ? "default" : "pointer", opacity: busy || !pw ? 0.55 : 1 }}>
                    {busy ? "Closing… (can take a few seconds)" : `Close ${open.length} trade${open.length === 1 ? "" : "s"} now`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>
                  {failed.length ? `${results.length - failed.length} closed, ${failed.length} failed` : results.length ? `All ${results.length} closed` : "Nothing was open"}
                </div>
                <div style={{ margin: "12px 0", border: "1px solid #21262d", borderRadius: 10, overflow: "hidden" }}>
                  {results.map((r, i) => (
                    <div key={i} style={{ padding: "8px 10px", borderBottom: "1px solid #161b22", fontFamily: MONO, fontSize: 11, display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: "#cdd9e5" }}>{r.label} · {r.pair}</span>
                      <span style={{ color: r.ok ? GREEN : RED, textAlign: "right" }}>{r.ok ? "closed" : r.error || "failed"}</span>
                    </div>
                  ))}
                </div>
                {!!failed.length && (
                  <div style={{ color: RED, fontSize: 11, lineHeight: 1.6, marginBottom: 10 }}>
                    Check the failed ones on Binance and close them there by hand if they are still open.
                  </div>
                )}
                <button onClick={close} style={{ width: "100%", background: "#21262d", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
