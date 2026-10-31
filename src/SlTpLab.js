import React, { useState, useEffect, useCallback, useRef } from "react";

// SL/TP lab: the backend replays every logged BUY/SELL decision of each model over real
// 1-minute candles for a grid of stops and targets, fees included. This screen starts
// that job, shows its progress and lays the result out as a table per model.

const MONO = "'Space Mono', monospace";
const GREEN = "#00e5a0";
const RED = "#ff4757";
const AMBER = "#ffa502";
const MUTED = "#8b949e";
const BASE = process.env.REACT_APP_API_BASE || "https://fxangel-backend-production.up.railway.app";

const money = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const ratioLabel = (r) => `1:${r}`;
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

async function api(path, opts) {
  try {
    const res = await fetch(`${BASE}${path}`, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default function SlTpLab({ labels, colors }) {
  const [job, setJob] = useState(null);       // state from the server
  const [lastDone, setLastDone] = useState(null); // newest finished run, kept on screen while a new one runs
  const [days, setDays] = useState(14);
  const [who, setWho] = useState(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    const s = await api("/api/arena/whatif/grid");
    if (!s) { setOffline(true); return null; }
    setOffline(false);
    setJob(s);
    if (s.status === "done") setLastDone(s);
    return s;
  }, []);

  // look at the server once on open, then poll while a job is running
  useEffect(() => { refresh(); return () => clearInterval(timer.current); }, [refresh]);
  const status = job ? job.status : null;
  useEffect(() => {
    clearInterval(timer.current);
    if (status === "running") timer.current = setInterval(refresh, 3000);
    return () => clearInterval(timer.current);
  }, [status, refresh]);

  const run = async () => {
    const s = await api(`/api/arena/whatif/grid/run?days=${days}`, { method: "POST" });
    if (s) { setOffline(false); setJob(s); if (s.status === "done") setLastDone(s); } else setOffline(true);
  };

  const shown = job && job.status === "done" ? job : lastDone;
  const result = shown ? shown.result : null;
  const accounts = result ? Object.keys(result.accounts).sort() : [];
  const active = who && accounts.includes(who) ? who : accounts[0];
  const running = job && job.status === "running";
  const pct = running && job.progress.total ? Math.min(100, Math.round((job.progress.done / job.progress.total) * 100)) : 0;

  const card = { background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 14 };

  return (
    <div>
      <div style={card}>
        <div style={{ color: "#cdd9e5", fontSize: 12, lineHeight: 1.6 }}>
          Replays every BUY or SELL a model has logged over real 1-minute Binance candles, once for each stop and target below.
          Shows what each model would have earned with each setting, fees included, on the entries it actually chose.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <select value={days} onChange={(e) => setDays(+e.target.value)} disabled={running} style={{
            background: "#010409", border: "1px solid #30363d", borderRadius: 8, color: "#cdd9e5",
            fontFamily: MONO, fontSize: 11, padding: "9px 10px",
          }}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button onClick={run} disabled={running || offline} style={{
            background: running ? "#21262d" : GREEN, color: running ? MUTED : "#010409", border: "none", borderRadius: 8,
            fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "10px 16px", cursor: running ? "default" : "pointer",
          }}>{running ? "Running…" : result ? "Run again" : "Run test"}</button>
          {result && shown.finishedAt && (
            <span style={{ color: "#484f58", fontFamily: MONO, fontSize: 9 }}>
              done {clock(shown.finishedAt)} · {result.decisions} decisions · last {result.days} days
            </span>
          )}
        </div>
        {running && (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, background: "#161b22", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: GREEN, transition: "width .4s" }} />
            </div>
            <div style={{ color: MUTED, fontFamily: MONO, fontSize: 9, marginTop: 6 }}>
              Fetching candles{job.progress.symbol ? ` for ${job.progress.symbol}` : ""}… {pct}%. It goes slowly on purpose, so it doesn't use up Binance's request limit. It can take a couple of minutes.
            </div>
          </div>
        )}
        {job && job.status === "error" && (
          <div style={{ color: RED, fontFamily: MONO, fontSize: 10, marginTop: 10, lineHeight: 1.5 }}>Could not finish: {job.error}</div>
        )}
        {offline && (
          <div style={{ color: AMBER, fontFamily: MONO, fontSize: 10, marginTop: 10, lineHeight: 1.5 }}>
            Can't reach the server, or it doesn't have the SL/TP lab yet. Try again in a minute.
          </div>
        )}
        {job && job.status === "idle" && !offline && (
          <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, marginTop: 10 }}>Nothing run yet. Press Run test.</div>
        )}
      </div>

      {result && !accounts.length && (
        <div style={{ ...card, marginTop: 10, color: MUTED, fontSize: 12, lineHeight: 1.6 }}>
          No BUY or SELL decisions with a price in this period, so there is nothing to replay.
        </div>
      )}

      {result && accounts.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "12px 0 10px" }}>
            {accounts.map((k) => {
              const on = k === active;
              const c = colors[k] || MUTED;
              return (
                <button key={k} onClick={() => setWho(k)} style={{
                  flexShrink: 0, cursor: "pointer", fontFamily: MONO, fontSize: 11, padding: "7px 14px", borderRadius: 18,
                  background: on ? `${c}22` : "#0d1117", border: `1px solid ${on ? c : "#30363d"}`, color: on ? c : MUTED, fontWeight: on ? 700 : 400,
                }}>{labels[k] || k}</button>
              );
            })}
          </div>
          <Grid result={result} acct={result.accounts[active]} />
        </>
      )}

      <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, marginTop: 10, lineHeight: 1.6 }}>
        Past entries only: this shows how different stops and targets would have worked on the trades the models chose, not whether a different stop would have changed what they chose.
        If one minute touches both levels, the stop counts first. Decisions that failed to open are included. One trade per coin at a time, as in live trading.
        A setting that fits the past well may not work next week.
      </div>
    </div>
  );
}

function Grid({ result, acct }) {
  if (!acct) return null;
  const { slGrid, ratios, minReliable } = result;
  const byKey = {};
  acct.combos.forEach((c) => { byKey[`${c.slPct}|${c.ratio}`] = c; });
  const maxAbs = Math.max(0.01, ...acct.combos.map((c) => Math.abs(c.net)));
  const best = acct.best;
  const th = { color: MUTED, fontFamily: MONO, fontSize: 9, fontWeight: 400, padding: "6px 4px", textAlign: "center" };

  return (
    <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 12 }}>
      {best ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: MUTED, fontFamily: MONO, fontSize: 9, letterSpacing: 0.8 }}>BEST SETTING FOUND</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <span style={{ color: "#fff", fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
              stop {best.slPct}% · target {best.tpPct}%
            </span>
            <span style={{ color: best.net >= 0 ? GREEN : RED, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{money(best.net)}</span>
            <span style={{ color: MUTED, fontSize: 11 }}>
              on {best.n} trades{best.winRate != null ? ` · ${best.winRate}% won` : ""}
            </span>
          </div>
          {best.net <= 0 && (
            <div style={{ color: AMBER, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
              Even the best setting loses money after fees on these entries. The entries need to improve, not only the stop and target.
            </div>
          )}
          {!acct.reliable && (
            <div style={{ color: AMBER, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
              Only {best.n} trades behind this (under {minReliable}): treat it as a hint, not a result.
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: MUTED, fontSize: 12, marginBottom: 12 }}>No trades could be replayed for this model.</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 3, minWidth: 330 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>STOP</th>
              {ratios.map((r) => <th key={r} style={th}>{ratioLabel(r)}<div style={{ opacity: 0.6 }}>target ×{r}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {slGrid.map((sl) => (
              <tr key={sl}>
                <td style={{ color: "#cdd9e5", fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "0 6px 0 0", whiteSpace: "nowrap" }}>{sl}%</td>
                {ratios.map((r) => {
                  const c = byKey[`${sl}|${r}`];
                  if (!c || !c.n) return <td key={r} style={{ textAlign: "center", color: "#484f58", fontFamily: MONO, fontSize: 10 }}>–</td>;
                  const isBest = best && c.slPct === best.slPct && c.ratio === best.ratio;
                  const tone = c.net >= 0 ? "0,229,160" : "255,71,87";
                  const a = (0.1 + 0.4 * (Math.abs(c.net) / maxAbs)).toFixed(2);
                  return (
                    <td key={r} title={`${c.wins} won · ${c.losses} lost · ${c.open} still open · fees ${money(-c.fees)}`} style={{
                      textAlign: "center", padding: "7px 2px", borderRadius: 8, background: `rgba(${tone},${a})`,
                      outline: isBest ? `2px solid #fff` : "none", outlineOffset: -2,
                    }}>
                      <div style={{ color: c.net >= 0 ? GREEN : RED, fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{money(c.net)}</div>
                      <div style={{ color: MUTED, fontFamily: MONO, fontSize: 8, marginTop: 1 }}>{c.winRate != null ? `${c.winRate}% · ` : ""}{c.n}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ color: "#484f58", fontFamily: MONO, fontSize: 9, marginTop: 8, lineHeight: 1.6 }}>
        Each box: net profit after fees, then win rate and number of trades. Columns are the target as a multiple of the stop (1:2 means target = 2 × stop). The white outline marks the best box.
      </div>
    </div>
  );
}
