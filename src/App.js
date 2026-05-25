import React from "react";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Backend URL — deployed on Railway
const API_BASE = "https://fxangel-backend-production.up.railway.app";

const FX_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD"];
const CRYPTO_PAIRS = ["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "BNB/USD", "IOTA/USD", "DOGE/USD", "ETC/USD"];
const PAIRS = [...FX_PAIRS, ...CRYPTO_PAIRS];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const apiFetch = async (path, opts = {}) => {
  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    return await res.json();
  } catch {
    return null;
  }
};

const sentimentColor = (s) =>
  s === "positive" ? "#00e5a0" : s === "negative" ? "#ff4757" : "#ffa502";
const sentimentIcon = (s) =>
  s === "positive" ? "▲" : s === "negative" ? "▼" : "◆";

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function ATRBadge({ label, value, color }) {
  return (
    <div style={{
      background: `${color}15`, border: `1px solid ${color}40`,
      borderRadius: 8, padding: "6px 10px", textAlign: "center", minWidth: 90,
    }}>
      <div style={{ fontSize: 9, color, fontFamily: "'Space Mono', monospace", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#fff", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ConfidenceBar({ value }) {
  const color = value >= 80 ? "#00e5a0" : value >= 65 ? "#ffa502" : "#ff4757";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#8b949e", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>CONFIDENCE</span>
        <span style={{ color, fontSize: 10, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 4, background: "#21262d", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 2, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

function SignalCard({ signal, expanded, onToggle }) {
  const dirColor = signal.direction === "BUY" ? "#00e5a0" : "#ff4757";
  const statusMap = {
    active: { label: "● LIVE", color: "#00e5a0" },
    closed_profit: { label: "✓ PROFIT", color: "#00e5a0" },
    closed_loss: { label: "✗ LOSS", color: "#ff4757" },
  };
  const st = statusMap[signal.status] || statusMap.active;
  const sltp = signal.sltp || {};
  const timeStr = signal.time ? new Date(signal.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "--:--";

  return (
    <div onClick={onToggle} style={{
      background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
      border: `1px solid ${dirColor}30`,
      borderLeft: `3px solid ${dirColor}`,
      borderRadius: 12, padding: "14px 16px",
      cursor: "pointer", marginBottom: 10,
      transition: "border-color 0.2s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: `${dirColor}20`, border: `1px solid ${dirColor}`,
            borderRadius: 6, padding: "3px 10px",
          }}>
            <span style={{ color: dirColor, fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 12 }}>{signal.direction}</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2 }}>{signal.pair}</div>
              {signal.assetClass === "CRYPTO" && (
                <div style={{ background: "#ffa50220", border: "1px solid #ffa50240", borderRadius: 4, padding: "1px 5px", fontSize: 8, color: "#ffa502", fontFamily: "'Space Mono', monospace" }}>CRYPTO</div>
              )}
            </div>
            <div style={{ color: "#8b949e", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>
              {timeStr} · {signal.source}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: st.color, fontSize: 10, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{st.label}</div>
          <div style={{ color: "#fff", fontFamily: "'Space Mono', monospace", fontSize: 13 }}>{signal.entryPrice}</div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, borderTop: "1px solid #21262d", paddingTop: 14 }}>
          <ConfidenceBar value={signal.confidence} />

          {signal.newsReason && (
            <div style={{
              background: "#ff47570d", border: "1px solid #ff475725",
              borderRadius: 8, padding: "8px 12px", marginTop: 12,
            }}>
              <div style={{ color: "#ff4757", fontSize: 10, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>📰 NEWS DRIVER</div>
              <div style={{ color: "#cdd9e5", fontSize: 11, lineHeight: 1.5 }}>{signal.newsReason}</div>
            </div>
          )}

          {signal.taReason && (
            <div style={{
              background: "#58a6ff0d", border: "1px solid #58a6ff25",
              borderRadius: 8, padding: "8px 12px", marginTop: 8,
            }}>
              <div style={{ color: "#58a6ff", fontSize: 10, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>📊 TECHNICAL ANALYSIS</div>
              <div style={{ color: "#cdd9e5", fontSize: 11, lineHeight: 1.5 }}>{signal.taReason}</div>
            </div>
          )}

          {signal.timeframes && (
            <div style={{
              background: "#0d1117", border: "1px solid #21262d",
              borderRadius: 8, padding: "10px 12px", marginTop: 8,
            }}>
              <div style={{ color: "#ffa502", fontSize: 10, fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>⏱ 3-TIMEFRAME CONFLUENCE</div>
              {Object.entries(signal.timeframes).map(([tf, data]) => {
                const tfColor = data.signal === "BUY" ? "#00e5a0" : data.signal === "SELL" ? "#ff4757" : "#8b949e";
                return (
                  <div key={tf} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ background: "#21262d", borderRadius: 4, padding: "1px 6px", color: "#cdd9e5", fontSize: 10, fontFamily: "'Space Mono', monospace", width: 28, textAlign: "center" }}>{tf}</div>
                      <div style={{ color: tfColor, fontSize: 11, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{data.signal}</div>
                      <div style={{ color: "#8b949e", fontSize: 10 }}>{data.trend}</div>
                    </div>
                    <div style={{ color: tfColor, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>{data.confidence}%</div>
                  </div>
                );
              })}
            </div>
          )}

          {sltp.atr && (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: "#8b949e", fontSize: 10, fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
                ATR(14) = {sltp.atr} · SL / TP · 1:2 R:R
              </div>
              {[
                { label: "🟢 Low", sl: sltp.low?.sl, tp: sltp.low?.tp },
                { label: "🟡 Med", sl: sltp.medium?.sl, tp: sltp.medium?.tp },
                { label: "🔴 High", sl: sltp.high?.sl, tp: sltp.high?.tp },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <div style={{ color: "#8b949e", fontSize: 11, width: 56 }}>{r.label}</div>
                  <ATRBadge label="SL" value={r.sl} color="#ff4757" />
                  <ATRBadge label="TP" value={r.tp} color="#00e5a0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewsRow({ item }) {
  const ic = sentimentColor(item.sentiment);
  const impactColor = item.impact === "high" ? "#ff4757" : item.impact === "medium" ? "#ffa502" : "#8b949e";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "9px 0", borderBottom: "1px solid #21262d", fontSize: 11,
    }}>
      <div style={{ color: "#8b949e", fontFamily: "'Space Mono', monospace", width: 36, flexShrink: 0, fontSize: 10 }}>{item.time}</div>
      <div style={{
        background: `${impactColor}20`, color: impactColor,
        border: `1px solid ${impactColor}40`,
        borderRadius: 4, padding: "1px 5px", fontSize: 8,
        fontFamily: "'Space Mono', monospace", flexShrink: 0, width: 30, textAlign: "center",
      }}>{item.impact?.toUpperCase()}</div>
      <div style={{
        background: "#21262d", borderRadius: 4, padding: "1px 5px",
        color: "#cdd9e5", fontSize: 9, fontFamily: "'Space Mono', monospace", flexShrink: 0,
      }}>{item.currency}</div>
      <div style={{ color: "#cdd9e5", flex: 1, fontSize: 10, lineHeight: 1.3 }}>{item.event}</div>
      {item.released && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: ic, fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700 }}>
            {sentimentIcon(item.sentiment)} {item.actual}
          </div>
          <div style={{ color: "#8b949e", fontSize: 9 }}>f: {item.forecast}</div>
        </div>
      )}
      {!item.released && (
        <div style={{ color: "#8b949e", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>f: {item.forecast}</div>
      )}
    </div>
  );
}

function StatusDot({ connected }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: connected ? "#00e5a0" : "#ff4757",
        boxShadow: connected ? "0 0 6px #00e5a0" : "none",
        animation: connected ? "pulse 2s infinite" : "none",
      }} />
      <span style={{ color: connected ? "#00e5a0" : "#ff4757", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>
        {connected ? "LIVE" : "OFFLINE"}
      </span>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function FXAngel() {
  const [activeTab, setActiveTab] = useState("signals");
  const [expandedSignal, setExpandedSignal] = useState(null);
  const [prices, setPrices] = useState({});
  const [signals, setSignals] = useState([]);
  const [news, setNews] = useState([]);
  const [serverStatus, setServerStatus] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notification, setNotification] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [selectedPair, setSelectedPair] = useState("EUR/USD");
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChat, setTelegramChat] = useState("");
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const prevSignalCount = useRef(0);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [priceData, signalData, newsData, statusData] = await Promise.all([
      apiFetch("/api/prices"),
      apiFetch("/api/signals"),
      apiFetch("/api/news"),
      apiFetch("/api/status"),
    ]);

    if (priceData?.prices) { setPrices(priceData.prices); setConnected(true); }
    else setConnected(false);

    if (signalData?.signals) {
      const newCount = signalData.signals.length;
      if (newCount > prevSignalCount.current && prevSignalCount.current > 0) {
        const latest = signalData.signals[0];
        setNotification(latest);
        setTimeout(() => setNotification(null), 6000);
      }
      prevSignalCount.current = newCount;
      setSignals(signalData.signals);
    }

    if (newsData?.news) setNews(newsData.news);
    if (statusData) setServerStatus(statusData);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 1000); // Refresh every second
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── AI Analysis ───────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    setAnalysisLoading(true);
    setAiAnalysis(null);
    const data = await apiFetch("/api/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair: selectedPair }),
    });
    if (data?.analysis) setAiAnalysis(data.analysis);
    else setAiAnalysis({ error: "Analysis failed — please try again." });
    setAnalysisLoading(false);
  };

  // ── Telegram test ─────────────────────────────────────────────────────────
  const testTelegram = async () => {
    setTestingTelegram(true);
    const data = await apiFetch("/api/telegram/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: telegramToken, chatId: telegramChat }),
    });
    setTelegramStatus(data?.success ? "connected" : "error");
    setTestingTelegram(false);
  };

  // ── Sentiment summary ─────────────────────────────────────────────────────
  const sentimentSummary = (() => {
    const currencies = {};
    news.filter(n => n.impact === "high" && n.released).forEach(n => {
      if (!currencies[n.currency]) currencies[n.currency] = { pos: 0, neg: 0, neu: 0 };
      if (n.sentiment === "positive") currencies[n.currency].pos++;
      else if (n.sentiment === "negative") currencies[n.currency].neg++;
      else currencies[n.currency].neu++;
    });
    return Object.entries(currencies).map(([currency, c]) => {
      const total = c.pos + c.neg + c.neu;
      let result = "NO SIGNAL", signaling = false;
      if (c.pos > 0 && c.neg > 0) result = "MIXED — IGNORED";
      else if (c.neg > 0) { result = `NEGATIVE ▼ (${c.neg}/${total})`; signaling = true; }
      else if (c.pos > 0) { result = `POSITIVE ▲ (${c.pos}/${total})`; signaling = true; }
      return { currency, total, ...c, result, signaling };
    });
  })();

  const tabs = [
    { id: "signals", label: "Signals", icon: "⚡" },
    { id: "news", label: "News", icon: "📰" },
    { id: "analysis", label: "AI TA", icon: "🧠" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  const liveSignals = signals.filter(s => s.status === "active");

  return (
    <div style={{
      background: "#010409", minHeight: "100vh", color: "#cdd9e5",
      fontFamily: "'Inter', sans-serif", maxWidth: 480,
      margin: "0 auto", position: "relative",
    }}>
      {/* Background glow */}
      <div style={{ position: "fixed", top: -100, left: -100, width: 300, height: 300, background: "radial-gradient(circle, #ff475710 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", top: -50, right: -80, width: 250, height: 250, background: "radial-gradient(circle, #00e5a010 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#0d1117", border: "1px solid #ff475760",
          borderRadius: 12, padding: "12px 18px", zIndex: 1000,
          boxShadow: "0 8px 32px #ff475720",
          display: "flex", alignItems: "center", gap: 12, minWidth: 270,
        }}>
          <div style={{ fontSize: 18 }}>⚡</div>
          <div>
            <div style={{ color: "#ff4757", fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700 }}>NEW SIGNAL · TELEGRAM SENT</div>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>
              {notification.pair} {notification.direction} · {notification.confidence}%
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        background: "#0d1117", borderBottom: "1px solid #21262d",
        padding: "14px 18px 10px", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>👼</span>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 26,
                letterSpacing: 4, color: "#fff", textShadow: "0 0 20px #ff475730",
              }}>FXANGEL</span>
            </div>
            <div style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>
              AI-POWERED FX SIGNAL ENGINE
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <StatusDot connected={connected} />
            <div style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
              {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} GMT
            </div>
          </div>
        </div>

        {/* Price ticker */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {PAIRS.map(pair => (
            <div key={pair} style={{
              flexShrink: 0, background: "#21262d", borderRadius: 6, padding: "4px 8px",
              display: "flex", gap: 6, alignItems: "center",
            }}>
              <span style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace" }}>{pair}</span>
              <span style={{ color: prices[pair] ? "#fff" : "#484f58", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>
                {prices[pair]?.toFixed(pair.includes("JPY") ? 3 : 4) || "---"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "14px 14px 100px", position: "relative", zIndex: 1 }}>

        {/* ── SIGNALS TAB ── */}
        {activeTab === "signals" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2 }}>ACTIVE SIGNALS</div>
              <div style={{ display: "flex", gap: 8 }}>
                {liveSignals.length > 0 && (
                  <div style={{ background: "#ff475720", border: "1px solid #ff475740", borderRadius: 6, padding: "3px 8px" }}>
                    <span style={{ color: "#ff4757", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>{liveSignals.length} LIVE</span>
                  </div>
                )}
                <button onClick={fetchAll} style={{
                  background: "#21262d", border: "1px solid #30363d", borderRadius: 6,
                  padding: "3px 8px", color: "#8b949e", fontSize: 10,
                  fontFamily: "'Space Mono', monospace", cursor: "pointer",
                }}>↻ REFRESH</button>
              </div>
            </div>

            {/* Sentiment summary bar */}
            {sentimentSummary.length > 0 && (
              <div style={{
                background: "#0d1117", border: "1px solid #21262d",
                borderRadius: 10, padding: "10px 12px", marginBottom: 12,
              }}>
                <div style={{ color: "#58a6ff", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>🧠 LIVE SENTIMENT ENGINE</div>
                {sentimentSummary.map(s => (
                  <div key={s.currency} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ background: "#21262d", borderRadius: 4, padding: "1px 6px", color: "#cdd9e5", fontFamily: "'Space Mono', monospace", fontSize: 10 }}>{s.currency}</div>
                      <span style={{ color: "#8b949e", fontSize: 10 }}>{s.total} high-impact</span>
                    </div>
                    <div style={{
                      color: s.signaling ? (s.neg > 0 ? "#ff4757" : "#00e5a0") : "#8b949e",
                      fontSize: 9, fontFamily: "'Space Mono', monospace",
                      background: s.signaling ? (s.neg > 0 ? "#ff475710" : "#00e5a010") : "transparent",
                      border: s.signaling ? `1px solid ${s.neg > 0 ? "#ff475730" : "#00e5a030"}` : "none",
                      borderRadius: 4, padding: "1px 6px",
                    }}>{s.result}</div>
                  </div>
                ))}
              </div>
            )}

            {!connected && (
              <div style={{
                background: "#ff47570d", border: "1px solid #ff475730",
                borderRadius: 10, padding: 16, textAlign: "center", marginBottom: 12,
              }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div>
                <div style={{ color: "#ff4757", fontSize: 12, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>BACKEND OFFLINE</div>
                <div style={{ color: "#8b949e", fontSize: 11 }}>
                  Deploy server.js to Railway/Render and update API_BASE in the app.
                  See README.md for instructions.
                </div>
              </div>
            )}

            {signals.length === 0 && connected && (
              <div style={{ textAlign: "center", padding: 32, color: "#8b949e" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
                <div style={{ fontSize: 12, fontFamily: "'Space Mono', monospace" }}>Monitoring markets... signals appear here when detected</div>
              </div>
            )}

            {signals.map(signal => (
              <SignalCard
                key={signal.id}
                signal={signal}
                expanded={expandedSignal === signal.id}
                onToggle={() => setExpandedSignal(expandedSignal === signal.id ? null : signal.id)}
              />
            ))}
          </div>
        )}

        {/* ── NEWS TAB ── */}
        {activeTab === "news" && (
          <div>
            <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, marginBottom: 4 }}>ECONOMIC CALENDAR</div>
            <div style={{ color: "#8b949e", fontSize: 10, marginBottom: 14, fontFamily: "'Space Mono', monospace" }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {[["HIGH", "#ff4757"], ["MEDIUM", "#ffa502"], ["LOW", "#8b949e"]].map(([label, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
                  <span style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace" }}>{label}</span>
                </div>
              ))}
            </div>

            {news.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "#8b949e", fontSize: 11 }}>
                {connected ? "Loading calendar..." : "Backend offline — no news data"}
              </div>
            ) : (
              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: "4px 12px" }}>
                {news.map((item, i) => <NewsRow key={i} item={item} />)}
              </div>
            )}
          </div>
        )}

        {/* ── AI ANALYSIS TAB ── */}
        {activeTab === "analysis" && (
          <div>
            <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, marginBottom: 14 }}>AI TECHNICAL ANALYSIS</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>💱 FX PAIRS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {FX_PAIRS.map(pair => (
                  <button key={pair} onClick={() => { setSelectedPair(pair); setAiAnalysis(null); }} style={{
                    background: selectedPair === pair ? "#ff4757" : "#21262d",
                    border: `1px solid ${selectedPair === pair ? "#ff4757" : "#30363d"}`,
                    borderRadius: 6, padding: "5px 10px",
                    color: selectedPair === pair ? "#fff" : "#8b949e",
                    fontFamily: "'Space Mono', monospace", fontSize: 10, cursor: "pointer",
                  }}>
                    {pair}
                  </button>
                ))}
              </div>
              <div style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>🪙 CRYPTO PAIRS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CRYPTO_PAIRS.map(pair => (
                  <button key={pair} onClick={() => { setSelectedPair(pair); setAiAnalysis(null); }} style={{
                    background: selectedPair === pair ? "#ffa502" : "#21262d",
                    border: `1px solid ${selectedPair === pair ? "#ffa502" : "#30363d"}`,
                    borderRadius: 6, padding: "5px 10px",
                    color: selectedPair === pair ? "#fff" : "#8b949e",
                    fontFamily: "'Space Mono', monospace", fontSize: 10, cursor: "pointer",
                  }}>
                    {pair}
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              background: "#0d1117", border: "1px solid #21262d",
              borderRadius: 12, padding: "12px 14px", marginBottom: 14,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ color: "#8b949e", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>CURRENT PRICE</div>
                <div style={{ color: "#fff", fontFamily: "'Space Mono', monospace", fontSize: 22, fontWeight: 700 }}>
                  {prices[selectedPair]?.toFixed(selectedPair.includes("JPY") ? 3 : 5) || "---"}
                </div>
              </div>
              <button onClick={runAnalysis} disabled={analysisLoading} style={{
                background: analysisLoading ? "#21262d" : "linear-gradient(135deg, #ff4757, #c0392b)",
                border: "none", borderRadius: 10, padding: "10px 16px",
                color: "#fff", fontFamily: "'Space Mono', monospace", fontSize: 11,
                cursor: analysisLoading ? "not-allowed" : "pointer", fontWeight: 700,
              }}>
                {analysisLoading ? "ANALYSING..." : "RUN ANALYSIS"}
              </button>
            </div>

            {analysisLoading && (
              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 20, textAlign: "center" }}>
                <div style={{ color: "#58a6ff", fontSize: 12, fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>🧠 ANALYSING {selectedPair}...</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#58a6ff", animation: `bounce 1s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {aiAnalysis && !analysisLoading && (
              <div style={{ background: "#0d1117", border: "1px solid #58a6ff30", borderRadius: 12, padding: 14 }}>
                {aiAnalysis.error ? (
                  <div style={{ color: "#ff4757", fontSize: 12 }}>{aiAnalysis.error}</div>
                ) : (
                  <>
                    <div style={{ color: "#58a6ff", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
                      🧠 AI ANALYSIS · {selectedPair} · {new Date().toLocaleTimeString()}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <div style={{
                        background: aiAnalysis.signal === "BUY" ? "#00e5a020" : aiAnalysis.signal === "SELL" ? "#ff475720" : "#21262d",
                        border: `1px solid ${aiAnalysis.signal === "BUY" ? "#00e5a040" : aiAnalysis.signal === "SELL" ? "#ff475740" : "#30363d"}`,
                        borderRadius: 8, padding: "6px 12px", textAlign: "center",
                      }}>
                        <div style={{ color: "#8b949e", fontSize: 8, fontFamily: "'Space Mono', monospace" }}>SIGNAL</div>
                        <div style={{ color: aiAnalysis.signal === "BUY" ? "#00e5a0" : aiAnalysis.signal === "SELL" ? "#ff4757" : "#8b949e", fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2 }}>{aiAnalysis.signal}</div>
                      </div>
                      <div style={{ background: "#21262d", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                        <div style={{ color: "#8b949e", fontSize: 8, fontFamily: "'Space Mono', monospace" }}>CONFIDENCE</div>
                        <div style={{ color: "#fff", fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700 }}>{aiAnalysis.confidence}%</div>
                      </div>
                      <div style={{ background: "#21262d", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                        <div style={{ color: "#8b949e", fontSize: 8, fontFamily: "'Space Mono', monospace" }}>TREND</div>
                        <div style={{ color: "#cdd9e5", fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700 }}>{aiAnalysis.trend}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      <div style={{ background: "#ff475710", border: "1px solid #ff475730", borderRadius: 6, padding: "4px 10px" }}>
                        <span style={{ color: "#8b949e", fontSize: 9 }}>S: </span>
                        <span style={{ color: "#ff4757", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>{aiAnalysis.support}</span>
                      </div>
                      <div style={{ background: "#00e5a010", border: "1px solid #00e5a030", borderRadius: 6, padding: "4px 10px" }}>
                        <span style={{ color: "#8b949e", fontSize: 9 }}>R: </span>
                        <span style={{ color: "#00e5a0", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>{aiAnalysis.resistance}</span>
                      </div>
                      {aiAnalysis.pattern && aiAnalysis.pattern !== "None" && (
                        <div style={{ background: "#ffa50210", border: "1px solid #ffa50230", borderRadius: 6, padding: "4px 10px" }}>
                          <span style={{ color: "#ffa502", fontSize: 10 }}>📐 {aiAnalysis.pattern}</span>
                        </div>
                      )}
                    </div>
                    {aiAnalysis.timeframes && (
                      <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                        <div style={{ color: "#ffa502", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>⏱ 3-TIMEFRAME CONFLUENCE</div>
                        {Object.entries(aiAnalysis.timeframes).map(([tf, data]) => {
                          const tfColor = data.signal === "BUY" ? "#00e5a0" : data.signal === "SELL" ? "#ff4757" : "#8b949e";
                          return (
                            <div key={tf} style={{ marginBottom: 8, borderBottom: "1px solid #21262d", paddingBottom: 6 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <div style={{ background: "#21262d", borderRadius: 4, padding: "1px 6px", color: "#cdd9e5", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>{tf}</div>
                                  <div style={{ color: tfColor, fontSize: 12, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{data.signal}</div>
                                  <div style={{ color: "#8b949e", fontSize: 10 }}>{data.trend}</div>
                                </div>
                                <div style={{ color: tfColor, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>{data.confidence}%</div>
                              </div>
                              <div style={{ color: "#8b949e", fontSize: 10, lineHeight: 1.4 }}>{data.reasoning}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ background: "#161b22", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                      <div style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>AI REASONING</div>
                      <div style={{ color: "#cdd9e5", fontSize: 11, lineHeight: 1.6 }}>{aiAnalysis.reasoning}</div>
                    </div>
                    {aiAnalysis.signalGenerated && (
                      <div style={{
                        background: "linear-gradient(135deg, #00e5a015, #0d1117)",
                        border: "1px solid #00e5a040",
                        borderRadius: 8, padding: "10px 12px",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <div style={{ fontSize: 18 }}>⚡</div>
                        <div>
                          <div style={{ color: "#00e5a0", fontSize: 10, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>SIGNAL GENERATED & SENT TO TELEGRAM</div>
                          <div style={{ color: "#8b949e", fontSize: 10 }}>Check Signals tab and your Telegram for full SL/TP levels</div>
                        </div>
                      </div>
                    )}
                    {aiAnalysis.signalGenerated === false && aiAnalysis.duplicateReason && (
                      <div style={{
                        background: "#58a6ff10", border: "1px solid #58a6ff30",
                        borderRadius: 8, padding: "8px 12px",
                      }}>
                        <div style={{ color: "#58a6ff", fontSize: 10, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>🔄 DUPLICATE BLOCKED</div>
                        <div style={{ color: "#8b949e", fontSize: 10, marginTop: 2 }}>{aiAnalysis.duplicateReason}</div>
                      </div>
                    )}
                    {!aiAnalysis.signalGenerated && !aiAnalysis.duplicateReason && aiAnalysis.signal !== "WAIT" && (
                      <div style={{
                        background: "#ffa50210", border: "1px solid #ffa50230",
                        borderRadius: 8, padding: "8px 12px",
                      }}>
                        <div style={{ color: "#ffa502", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>
                          ⚠️ CONFIDENCE BELOW 70% — NO SIGNAL GENERATED
                        </div>
                      </div>
                    )}
                    {aiAnalysis.signal === "WAIT" && (
                      <div style={{
                        background: "#8b949e10", border: "1px solid #8b949e30",
                        borderRadius: 8, padding: "8px 12px",
                      }}>
                        <div style={{ color: "#8b949e", fontSize: 10, fontFamily: "'Space Mono', monospace" }}>
                          ⏳ WAIT — No clear setup detected for this pair right now
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!aiAnalysis && !analysisLoading && (
              <div style={{ textAlign: "center", padding: 28, color: "#8b949e" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🧠</div>
                <div style={{ fontSize: 11 }}>Select a pair and tap Run Analysis for a real-time AI technical breakdown</div>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && (
          <div>
            <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, marginBottom: 14 }}>SETTINGS</div>

            {/* Backend status */}
            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🖥️ Backend Status</div>
              {serverStatus ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    ["Pairs tracked", serverStatus.pairs],
                    ["Signals generated", serverStatus.signals],
                    ["News events", serverStatus.newsEvents],
                    ["Status", serverStatus.status?.toUpperCase()],
                  ].map(([label, val]) => (
                    <div key={label} style={{ background: "#161b22", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace" }}>{label}</div>
                      <div style={{ color: "#00e5a0", fontSize: 14, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{val}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#ff4757", fontSize: 11 }}>
                  Backend not connected. Deploy server.js and update API_BASE in FXAngel.jsx
                </div>
              )}
            </div>

            {/* Telegram */}
            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>📱 Telegram Notifications</div>
                {telegramStatus && (
                  <div style={{
                    background: telegramStatus === "connected" ? "#00e5a020" : "#ff475720",
                    border: `1px solid ${telegramStatus === "connected" ? "#00e5a040" : "#ff475740"}`,
                    borderRadius: 6, padding: "2px 8px",
                    color: telegramStatus === "connected" ? "#00e5a0" : "#ff4757",
                    fontSize: 9, fontFamily: "'Space Mono', monospace",
                  }}>{telegramStatus === "connected" ? "✓ CONNECTED" : "✗ ERROR"}</div>
                )}
              </div>

              {["BOT TOKEN", "CHAT ID"].map((label, i) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ color: "#8b949e", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>{label}</div>
                  <input
                    value={i === 0 ? telegramToken : telegramChat}
                    onChange={e => i === 0 ? setTelegramToken(e.target.value) : setTelegramChat(e.target.value)}
                    placeholder={i === 0 ? "123456789:ABCdef..." : "-100123456789"}
                    style={{
                      width: "100%", background: "#161b22", border: "1px solid #30363d",
                      borderRadius: 8, padding: "9px 12px", color: "#cdd9e5",
                      fontFamily: "'Space Mono', monospace", fontSize: 11,
                      boxSizing: "border-box", outline: "none",
                    }}
                  />
                </div>
              ))}

              <button onClick={testTelegram} disabled={testingTelegram || !telegramToken || !telegramChat} style={{
                width: "100%", background: "linear-gradient(135deg, #0088cc, #006699)",
                border: "none", borderRadius: 8, padding: "11px",
                color: "#fff", fontFamily: "'Space Mono', monospace", fontSize: 11,
                cursor: "pointer", fontWeight: 700, marginTop: 4,
              }}>
                {testingTelegram ? "TESTING..." : "TEST & CONNECT TELEGRAM"}
              </button>

              <div style={{ marginTop: 10, background: "#161b22", borderRadius: 8, padding: 10 }}>
                <div style={{ color: "#58a6ff", fontSize: 9, fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>SETUP GUIDE:</div>
                {[
                  "1. Open Telegram → message @BotFather → /newbot",
                  "2. Copy the token into BOT TOKEN above",
                  "3. Message your bot once (say anything)",
                  "4. Message @userinfobot to get your Chat ID",
                  "5. Paste Chat ID above → Test & Connect",
                ].map((step, i) => (
                  <div key={i} style={{ color: "#8b949e", fontSize: 10, lineHeight: 1.8 }}>{step}</div>
                ))}
              </div>
            </div>

            {/* Risk settings */}
            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📊 Risk / ATR Settings</div>
              <div style={{ color: "#8b949e", fontSize: 10, marginBottom: 10 }}>Period: 14 · Risk:Reward 1:2 · Auto-adjusts to volatility</div>
              {[
                { label: "🟢 Low Risk", sl: "0.5× ATR", tp: "1× ATR" },
                { label: "🟡 Med Risk", sl: "1× ATR", tp: "2× ATR" },
                { label: "🔴 High Risk", sl: "2× ATR", tp: "4× ATR" },
              ].map(r => (
                <div key={r.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: "1px solid #21262d",
                }}>
                  <div style={{ color: "#cdd9e5", fontSize: 12 }}>{r.label}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ background: "#ff475715", border: "1px solid #ff475730", borderRadius: 4, padding: "2px 7px", color: "#ff4757", fontSize: 9, fontFamily: "'Space Mono', monospace" }}>SL {r.sl}</div>
                    <div style={{ background: "#00e5a015", border: "1px solid #00e5a030", borderRadius: 4, padding: "2px 7px", color: "#00e5a0", fontSize: 9, fontFamily: "'Space Mono', monospace" }}>TP {r.tp}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480,
        background: "linear-gradient(180deg, transparent 0%, #010409 25%)",
        backdropFilter: "blur(20px)", borderTop: "1px solid #21262d",
        display: "flex", padding: "10px 0 18px", zIndex: 100,
      }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0",
          }}>
            <div style={{ fontSize: 18, filter: activeTab === tab.id ? "none" : "grayscale(1) opacity(0.4)" }}>{tab.icon}</div>
            <div style={{
              fontSize: 9, fontFamily: "'Space Mono', monospace",
              color: activeTab === tab.id ? "#ff4757" : "#8b949e",
              fontWeight: activeTab === tab.id ? 700 : 400,
            }}>{tab.label}</div>
            {tab.id === "signals" && liveSignals.length > 0 && (
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff4757", marginTop: -2 }} />
            )}
          </button>
        ))}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        input::placeholder { color: #484f58; }
        ::-webkit-scrollbar { width:0; height:0; }
      `}</style>
    </div>
  );
}
