/**
 * FXAngel Backend Server
 * ─────────────────────────────────────────────────
 * - Fetches live FX prices (Twelve Data API)
 * - Scrapes Forex Factory economic calendar
 * - Runs sentiment engine (your exact logic)
 * - Runs AI technical analysis (Claude API)
 * - Generates signals with ATR-based SL/TP
 * - Fires Telegram notifications instantly
 * - REST API for the web app frontend
 *
 * Deploy to: Railway / Render / Fly.io (~$5/month)
 */

import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";
import cron from "node-cron";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── CONFIG ───────────────────────────────────────
const CONFIG = {
  TWELVE_DATA_KEY: process.env.TWELVE_DATA_KEY,
  ALPHA_VANTAGE_KEY: process.env.ALPHA_VANTAGE_KEY,
  FINNHUB_KEY: process.env.FINNHUB_KEY,               // Free at finnhub.io
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  PORT: process.env.PORT || 3001,
  ATR_PERIOD: 14,
  FX_PRICE_INTERVAL_MS: 120000,    // FX prices every 2 minutes (Twelve Data — 720 calls/day)
  CRYPTO_PRICE_INTERVAL_MS: 1000,  // Crypto prices every second (Binance US)
  NEWS_INTERVAL_MS: 30000,        // News every 30 seconds
  TA_INTERVAL_MS: 900000,         // TA every 15 minutes
};

// Major USD pairs to monitor
const MAJOR_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY",
  "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD"
];

// ─── CRYPTO PAIRS ─────────────────────────────────
const CRYPTO_PAIRS = [
  "BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD",
  "BNB/USD", "IOTA/USD", "DOGE/USD", "ETC/USD"
];

const BINANCE_SYMBOLS = {
  "BTC/USD":  "BTCUSDT",
  "ETH/USD":  "ETHUSDT",
  "SOL/USD":  "SOLUSDT",
  "XRP/USD":  "XRPUSDT",
  "BNB/USD":  "BNBUSDT",
  "IOTA/USD": "IOTAUSDT",
  "DOGE/USD": "DOGEUSDT",
  "ETC/USD":  "ETCUSDT",
};

const COINGECKO_IDS = {
  "BTC/USD":  "bitcoin",
  "ETH/USD":  "ethereum",
  "SOL/USD":  "solana",
  "XRP/USD":  "ripple",
  "BNB/USD":  "binancecoin",
  "IOTA/USD": "iota",
  "DOGE/USD": "dogecoin",
  "ETC/USD":  "ethereum-classic",
};

// ─── STATE ────────────────────────────────────────
let state = {
  prices: {},
  candles: {},
  news: [],
  signals: [],
  lastNewsCheck: null,
  lastTACheck: null,
  processedNewsIds: new Set(),
  lastSignalTime: {},  // tracks last signal per pair+direction to avoid duplicates
};

// ─── FX PRICE FEED (Twelve Data — proven working on Railway) ──
const TWELVE_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY",
  "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD"
];

async function fetchPrices() {
  try {
    if (!CONFIG.TWELVE_DATA_KEY) {
      await fetchFallbackPrices();
      return;
    }

    // All 7 pairs in ONE batched call — Twelve Data needs EUR/USD format
    const symbols = TWELVE_PAIRS.join(",");
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols)}&apikey=${CONFIG.TWELVE_DATA_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    let updated = 0;
    TWELVE_PAIRS.forEach(pair => {
      // Twelve Data returns data with the original symbol as key
      const result = data[pair] || data[pair.replace("/", "")];
      if (result?.price) {
        const isJPY = pair.includes("JPY");
        state.prices[pair] = parseFloat(parseFloat(result.price).toFixed(isJPY ? 3 : 5));
        updated++;
      }
    });

    if (updated > 0) {
      console.log(`[PRICES] Updated ${updated} FX pairs via Twelve Data`);
    } else {
      console.log("[PRICES] Twelve Data returned no data — using fallback");
      await fetchFallbackPrices();
    }
  } catch (err) {
    console.error("[PRICES] Twelve Data error:", err.message);
    await fetchFallbackPrices();
  }
}

async function fetchFallbackPrices() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CHF,CAD,AUD,NZD");
    const data = await res.json();
    if (data.rates) {
      state.prices["EUR/USD"] = parseFloat((1 / data.rates.EUR).toFixed(5));
      state.prices["GBP/USD"] = parseFloat((1 / data.rates.GBP).toFixed(5));
      state.prices["USD/JPY"] = parseFloat(data.rates.JPY.toFixed(3));
      state.prices["USD/CHF"] = parseFloat(data.rates.CHF.toFixed(5));
      state.prices["AUD/USD"] = parseFloat((1 / data.rates.AUD).toFixed(5));
      state.prices["USD/CAD"] = parseFloat(data.rates.CAD.toFixed(5));
      state.prices["NZD/USD"] = parseFloat((1 / data.rates.NZD).toFixed(5));
      console.log("[PRICES] Fallback to frankfurter.app");
    }
  } catch (err) {
    console.error("[PRICES] Fallback error:", err.message);
  }
}

// ─── CANDLE HISTORY (for ATR calculation) ─────────
// ─── CRYPTO PRICE FEED (Binance — free, real-time) ───────────
async function fetchCryptoPrices() {
  try {
    // Single batch call — all 8 pairs in one request
    const symbolList = JSON.stringify(Object.values(BINANCE_SYMBOLS));
    const endpoints = [
      `https://api.binance.us/api/v3/ticker/price?symbols=${encodeURIComponent(symbolList)}`,
      `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(symbolList)}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          const symbolToPair = Object.fromEntries(
            Object.entries(BINANCE_SYMBOLS).map(([pair, sym]) => [sym, pair])
          );
          let updated = 0;
          data.forEach(item => {
            const pair = symbolToPair[item.symbol];
            if (pair && item.price) {
              const price = parseFloat(item.price);
              const decimals = price > 10000 ? 2 : price > 100 ? 3 : price > 1 ? 4 : 6;
              state.prices[pair] = parseFloat(price.toFixed(decimals));
              updated++;
            }
          });
          if (updated > 0) {
            console.log(`[CRYPTO] Updated ${updated} pairs via batch call`);
            return;
          }
        }
      } catch { continue; }
    }

    // Fallback to individual calls if batch fails
    const results = await Promise.all(
      Object.entries(BINANCE_SYMBOLS).map(async ([pair, symbol]) => {
        try {
          const res = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`);
          const data = await res.json();
          if (data.price) {
            const price = parseFloat(data.price);
            const decimals = price > 10000 ? 2 : price > 100 ? 3 : price > 1 ? 4 : 6;
            return { pair, price: parseFloat(price.toFixed(decimals)) };
          }
          return null;
        } catch { return null; }
      })
    );
    const valid = results.filter(r => r !== null);
    if (valid.length > 0) {
      valid.forEach(({ pair, price }) => { state.prices[pair] = price; });
      console.log(`[CRYPTO] Updated ${valid.length} pairs via individual calls`);
      return;
    }

    await fetchCryptoPricesFallback();
  } catch (err) {
    console.error("[CRYPTO] Binance error:", err.message);
    await fetchCryptoPricesFallback();
  }
}

async function fetchCryptoPricesFallback() {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const res = await fetch(url);
    const data = await res.json();

    const idToPair = Object.fromEntries(
      Object.entries(COINGECKO_IDS).map(([pair, id]) => [id, pair])
    );

    Object.entries(data).forEach(([id, prices]) => {
      const pair = idToPair[id];
      if (pair && prices.usd) {
        state.prices[pair] = parseFloat(prices.usd.toFixed(
          prices.usd > 1000 ? 2 : prices.usd > 1 ? 4 : 6
        ));
      }
    });
    console.log("[CRYPTO] Fallback to CoinGecko");
  } catch (err) {
    console.error("[CRYPTO] CoinGecko fallback error:", err.message);
  }
}

// ─── CANDLE DATA (Alpha Vantage — free, for TA timeframes) ───
const AV_KEY = process.env.ALPHA_VANTAGE_KEY;
const AV_PAIR_MAP = {
  "EUR/USD": "EUR", "GBP/USD": "GBP", "USD/JPY": "JPY",
  "USD/CHF": "CHF", "AUD/USD": "AUD", "USD/CAD": "CAD", "NZD/USD": "NZD",
};

async function fetchCandles(pair, interval) {
  try {
    if (!AV_KEY) return null;

    // Alpha Vantage interval format
    const avInterval = interval === "15min" ? "15min" : interval === "1hour" ? "60min" : "60min";
    const fromCurrency = AV_PAIR_MAP[pair] || pair.split("/")[0];
    const toCurrency = pair.split("/")[1];

    const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&interval=${avInterval}&outputsize=compact&apikey=${AV_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    const key = `Time Series FX (${avInterval})`;
    const timeSeries = data[key];
    if (!timeSeries) return null;

    const candles = Object.entries(timeSeries).slice(0, 50).map(([time, v]) => ({
      time,
      open: parseFloat(v["1. open"]),
      high: parseFloat(v["2. high"]),
      low: parseFloat(v["3. low"]),
      close: parseFloat(v["4. close"]),
    }));

    return candles;
  } catch (err) {
    console.error(`[CANDLES] ${pair} ${interval} error:`, err.message);
    return null;
  }
}

// ─── ATR CALCULATOR ───────────────────────────────
function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Simple moving average of true ranges for ATR
  const recent = trueRanges.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

// ─── SL/TP CALCULATOR (ATR-based) ─────────────────
function calculateSLTP(pair, direction, entryPrice, atr) {
  const isJPY = pair.includes("JPY");
  const round = (n) => parseFloat(n.toFixed(isJPY ? 3 : 5));
  const isBuy = direction === "BUY";

  return {
    atr: round(atr),
    low: {
      sl: round(isBuy ? entryPrice - atr * 0.5 : entryPrice + atr * 0.5),
      tp: round(isBuy ? entryPrice + atr * 1.0 : entryPrice - atr * 1.0),
    },
    medium: {
      sl: round(isBuy ? entryPrice - atr * 1.0 : entryPrice + atr * 1.0),
      tp: round(isBuy ? entryPrice + atr * 2.0 : entryPrice - atr * 2.0),
    },
    high: {
      sl: round(isBuy ? entryPrice - atr * 2.0 : entryPrice + atr * 2.0),
      tp: round(isBuy ? entryPrice + atr * 4.0 : entryPrice - atr * 4.0),
    },
  };
}

// ─── FOREX FACTORY SCRAPER ────────────────────────
async function scrapeForexFactory() {
  try {
    const url = "https://www.forexfactory.com/calendar";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const events = [];
    let currentDate = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

    $(".calendar__row").each((i, row) => {
      const impact = $(row).find(".calendar__impact span").attr("class") || "";
      const impactLevel = impact.includes("red") ? "high"
        : impact.includes("orange") ? "medium"
        : impact.includes("yellow") ? "low" : "none";

      if (impactLevel === "none") return;

      // Check if this row is a date header
      const dateHeader = $(row).find(".calendar__cell.calendar__date").text().trim();
      if (dateHeader) {
        currentDate = dateHeader;
        return;
      }

      const currency = $(row).find(".calendar__currency").text().trim();
      const event = $(row).find(".calendar__event-title").text().trim();
      const actual = $(row).find(".calendar__actual").text().trim();
      const forecast = $(row).find(".calendar__forecast").text().trim();
      const previous = $(row).find(".calendar__previous").text().trim();
      const time = $(row).find(".calendar__time").text().trim();

      if (!event || !currency) return;

      // Determine sentiment (actual vs forecast)
      const sentiment = determineSentiment(actual, forecast, previous, event);

      events.push({
        id: `${currency}-${event}-${time}`.replace(/\s/g, "-"),
        time,
        date: currentDate,
        currency,
        event,
        impact: impactLevel,
        actual,
        forecast,
        previous,
        sentiment,
        released: actual !== "" && actual !== "—",
        scrapedAt: new Date().toISOString(),
      });
    });

    console.log(`[NEWS] Scraped ${events.length} events from Forex Factory`);
    return events;
  } catch (err) {
    console.error("[NEWS] Forex Factory scrape error:", err.message);
    return [];
  }
}

// ─── INVESTING.COM NEWS SCRAPER ───────────────────
async function scrapeInvestingNews() {
  try {
    const url = "https://www.investing.com/news/forex-news";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FXAngel/1.0)" }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const articles = [];
    $("article").slice(0, 10).each((i, el) => {
      const title = $(el).find("a").first().text().trim();
      const href = $(el).find("a").first().attr("href");
      const time = $(el).find("time").text().trim();
      if (title) articles.push({ title, url: href, time, source: "Investing.com" });
    });

    return articles;
  } catch (err) {
    console.error("[NEWS] Investing.com error:", err.message);
    return [];
  }
}

// ─── SENTIMENT DETERMINER ─────────────────────────
function determineSentiment(actual, forecast, previous, eventName) {
  if (!actual || actual === "—" || actual === "") return "unreleased";

  // Parse numbers from strings like "4.1%", "180K", "2.3B"
  const parseVal = (str) => {
    if (!str) return null;
    const cleaned = str.replace(/[%KkMmBb,]/g, "").trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  };

  const actualVal = parseVal(actual);
  const forecastVal = parseVal(forecast);

  if (actualVal === null || forecastVal === null) return "neutral";

  // Events where lower = negative (unemployment, inflation in some contexts)
  const lowerIsBad = [
    "employment", "gdp", "retail sales", "pmi", "nfp", "non-farm",
    "payrolls", "spending", "sales", "confidence", "housing",
  ];
  const lowerIsGood = [
    "unemployment", "jobless", "claims", "deficit", "cpi", "inflation"
  ];

  const name = eventName.toLowerCase();
  const invertLogic = lowerIsGood.some(k => name.includes(k));

  const diff = actualVal - forecastVal;
  const threshold = Math.abs(forecastVal) * 0.001; // 0.1% tolerance

  if (Math.abs(diff) <= threshold) return "neutral";

  if (invertLogic) {
    return diff > 0 ? "negative" : "positive";
  }
  return diff > 0 ? "positive" : "negative";
}

// ─── YOUR SENTIMENT ENGINE LOGIC ──────────────────
// Rule: unanimous/near-unanimous = signal. Mixed = ignore.
function analyzeCurrencySentiment(events, currency) {
  const highImpact = events.filter(e =>
    e.currency === currency &&
    e.impact === "high" &&
    e.released &&
    e.sentiment !== "unreleased"
  );

  if (highImpact.length === 0) return { signal: false, reason: "No high-impact releases" };

  const positive = highImpact.filter(e => e.sentiment === "positive").length;
  const negative = highImpact.filter(e => e.sentiment === "negative").length;
  const neutral = highImpact.filter(e => e.sentiment === "neutral").length;
  const total = highImpact.length;

  // Mixed: both positive AND negative present → IGNORE
  if (positive > 0 && negative > 0) {
    return {
      signal: false,
      direction: null,
      reason: `Mixed signals (${positive} positive, ${negative} negative, ${neutral} neutral) — ignored per rules`,
      events: highImpact,
    };
  }

  // All neutral → no signal
  if (positive === 0 && negative === 0) {
    return { signal: false, reason: "All neutral — no signal", events: highImpact };
  }

  // Unanimous or near-unanimous negative
  if (negative > 0 && positive === 0) {
    return {
      signal: true,
      direction: "negative",   // currency is weak → sell it
      confidence: Math.round(70 + (negative / total) * 25),
      reason: `${negative}/${total} high-impact events negative (${highImpact.map(e => e.event).join(", ")})`,
      events: highImpact,
    };
  }

  // Unanimous or near-unanimous positive
  if (positive > 0 && negative === 0) {
    return {
      signal: true,
      direction: "positive",   // currency is strong → buy it
      confidence: Math.round(70 + (positive / total) * 25),
      reason: `${positive}/${total} high-impact events positive (${highImpact.map(e => e.event).join(", ")})`,
      events: highImpact,
    };
  }

  return { signal: false, reason: "Insufficient data" };
}

// ─── SIGNAL GENERATOR (News-based) ────────────────
async function generateNewsSignals(events) {
  const newSignals = [];
  const currencies = [...new Set(events.map(e => e.currency))];

  for (const currency of currencies) {
    const analysis = analyzeCurrencySentiment(events, currency);
    if (!analysis.signal) continue;

    // Find pairs affected by this currency
    const affectedPairs = MAJOR_PAIRS.filter(pair => {
      const [base, quote] = pair.split("/");
      return base === currency || quote === currency;
    });

    for (const pair of affectedPairs) {
      const signalKey = `news-${currency}-${analysis.direction}-${new Date().toDateString()}`;
      if (state.processedNewsIds.has(signalKey)) continue;

      const [base, quote] = pair.split("/");
      // If the weak currency is the BASE → SELL the pair
      // If the weak currency is the QUOTE → BUY the pair
      let direction;
      if (analysis.direction === "negative") {
        direction = base === currency ? "SELL" : "BUY";
      } else {
        direction = base === currency ? "BUY" : "SELL";
      }

      const entryPrice = state.prices[pair];
      if (!entryPrice) continue;

      // Use default ATR
      const atr = pair.includes("JPY") ? 0.45 : 0.0030;

      const sltp = calculateSLTP(pair, direction, entryPrice, atr);

      const signal = {
        id: `${Date.now()}-${pair}-news`,
        pair,
        direction,
        source: "NEWS",
        currency,
        newsReason: `${currency}: ${analysis.reason}`,
        taReason: null,
        confidence: analysis.confidence,
        entryPrice,
        sltp,
        time: new Date().toISOString(),
        status: "active",
      };

      newSignals.push(signal);
      state.processedNewsIds.add(signalKey);

      // Fire Telegram notification immediately
      await sendTelegramSignal(signal);
    }
  }

  return newSignals;
}

// ─── AI TECHNICAL ANALYSIS ────────────────────────
// ─── TRADING SESSION CHECKER ──────────────────────
function getCurrentSession() {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 12) return "London";
  if (hour >= 12 && hour < 17) return "New York";
  if (hour >= 0 && hour < 7) return "Asian";
  return "Late New York";
}

function isMarketActive() {
  const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false; // Weekend
  const hour = new Date().getUTCHours();
  return hour >= 0 && hour < 22; // Mon-Fri 00:00-22:00 UTC
}

// ─── DUPLICATE SIGNAL CHECKER ─────────────────────
function isDuplicateSignal(pair, direction) {
  const key = `${pair}-${direction}`;
  const lastTime = state.lastSignalTime[key];
  if (!lastTime) return false;
  const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
  return hoursSince < 4; // Block same pair+direction for 4 hours
}

function recordSignalTime(pair, direction) {
  const key = `${pair}-${direction}`;
  state.lastSignalTime[key] = Date.now();
}

// ─── 3-TIMEFRAME ANALYSIS ENGINE ──────────────────
async function analyzeTimeframe(pair, timeframe, candles, currentPrice, useHaiku = true) {
  const isJPY = pair.includes("JPY");
  const defaultATR = isJPY ? 0.45 : 0.0030;
  const session = getCurrentSession();

  // Build candle summary if available
  let candleSummary = "";
  if (candles && candles.length >= 10) {
    const recent = candles.slice(0, 10);
    const closes = recent.map(c => c.close);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);
    const highest = Math.max(...highs).toFixed(isJPY ? 3 : 5);
    const lowest = Math.min(...lows).toFixed(isJPY ? 3 : 5);
    const firstClose = closes[closes.length - 1].toFixed(isJPY ? 3 : 5);
    const lastClose = closes[0].toFixed(isJPY ? 3 : 5);
    candleSummary = `Last 10 ${timeframe} candles: High=${highest}, Low=${lowest}, Open=${firstClose}, Current=${lastClose}`;
  } else {
    candleSummary = `No candle data available — analyse based on current price ${currentPrice} and market knowledge`;
  }

  const response = await anthropic.messages.create({
    model: useHaiku ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-5",
    max_tokens: 400,
    messages: [{ role: "user", content: `You are FXAngel, a professional FX technical analyst.

Analyse ${pair} on the ${timeframe} timeframe ONLY.
Current price: ${currentPrice}
Session: ${session}
Date: ${new Date().toUTCString()}
${candleSummary}

Rules:
- Analyse ONLY the ${timeframe} timeframe perspective
- Confidence must be genuine (55-95%) — NOT always 72%
- WAIT if unclear or ranging
- BUY/SELL only with clear ${timeframe} technical reason
- Support/resistance must be near current price

Respond ONLY with valid JSON:
{"trend":"BULLISH","signal":"BUY","confidence":72,"support":1.1550,"resistance":1.1680,"pattern":"None","rsi_estimate":58,"reasoning":"${timeframe} specific reasoning here"}` }],
  });

  const text = response.content[0].text.replace(/```json|```/g, "").trim();
  const analysis = JSON.parse(text);
  analysis.timeframe = timeframe;
  return analysis;
}

async function runTechnicalAnalysis(pair) {
  try {
    const currentPrice = state.prices[pair];
    if (!currentPrice) return null;

    const isJPY = pair.includes("JPY");
    const defaultATR = isJPY ? 0.45 : 0.0030;
    const session = getCurrentSession();

    console.log(`[TA] Analysing ${pair} on 3 timeframes...`);

    // Fetch candles for each timeframe (Alpha Vantage)
    const [candles15m, candles1h] = await Promise.all([
      fetchCandles(pair, "15min"),
      fetchCandles(pair, "1hour"),
    ]);

    // Analyse each timeframe
    // useHaiku=false for manual analysis — use Sonnet for better quality
    const [tf15m, tf1h, tf4h] = await Promise.all([
      analyzeTimeframe(pair, "15min", candles15m, currentPrice, false),
      analyzeTimeframe(pair, "1hour", candles1h, currentPrice, false),
      analyzeTimeframe(pair, "4hour", null, currentPrice, false),
    ]);

    // 3-Timeframe Confluence Logic
    const signals = [tf4h.signal, tf1h.signal, tf15m.signal];
    const buyCount = signals.filter(s => s === "BUY").length;
    const sellCount = signals.filter(s => s === "SELL").length;
    const waitCount = signals.filter(s => s === "WAIT").length;

    let finalSignal = "WAIT";
    let confluenceScore = 0;

    if (buyCount === 3) {
      finalSignal = "BUY";
      confluenceScore = 100; // Perfect alignment
    } else if (sellCount === 3) {
      finalSignal = "SELL";
      confluenceScore = 100;
    } else if (buyCount === 2 && waitCount === 1) {
      finalSignal = "BUY";
      confluenceScore = 75; // Good alignment
    } else if (sellCount === 2 && waitCount === 1) {
      finalSignal = "SELL";
      confluenceScore = 75;
    } else if (buyCount === 2 && sellCount === 1) {
      finalSignal = "WAIT"; // Conflicting — ignore
      confluenceScore = 0;
    } else if (sellCount === 2 && buyCount === 1) {
      finalSignal = "WAIT"; // Conflicting — ignore
      confluenceScore = 0;
    }

    // Final confidence = average of timeframe confidences × confluence score
    const avgConfidence = Math.round((tf4h.confidence + tf1h.confidence + tf15m.confidence) / 3);
    const finalConfidence = finalSignal === "WAIT" ? avgConfidence :
      Math.round(avgConfidence * (confluenceScore / 100) * 1.2); // Boost for confluence

    // Cap at 95%
    const confidence = Math.min(95, finalConfidence);

    // ATR from 15min candles if available
    const atr = candles15m ? calculateATR(candles15m, 14) || defaultATR : defaultATR;

    const analysis = {
      pair,
      price: currentPrice,
      signal: finalSignal,
      confidence,
      trend: tf4h.trend,
      support: tf1h.support || tf4h.support,
      resistance: tf1h.resistance || tf4h.resistance,
      pattern: tf15m.pattern !== "None" ? tf15m.pattern : tf1h.pattern,
      rsi_estimate: tf1h.rsi_estimate,
      atr,
      time: new Date().toISOString(),
      session,
      timeframes: {
        "4H": { signal: tf4h.signal, confidence: tf4h.confidence, trend: tf4h.trend, reasoning: tf4h.reasoning },
        "1H": { signal: tf1h.signal, confidence: tf1h.confidence, trend: tf1h.trend, reasoning: tf1h.reasoning },
        "15M": { signal: tf15m.signal, confidence: tf15m.confidence, trend: tf15m.trend, reasoning: tf15m.reasoning },
      },
      reasoning: `4H: ${tf4h.reasoning} | 1H: ${tf1h.reasoning} | 15M: ${tf15m.reasoning}`,
    };

    console.log(`[TA] ${pair}: 4H=${tf4h.signal} 1H=${tf1h.signal} 15M=${tf15m.signal} → ${finalSignal} ${confidence}%`);
    return analysis;
  } catch (err) {
    console.error(`[TA] ${pair} error:`, err.message);
    return null;
  }
}

// ─── TA SIGNAL GENERATOR ──────────────────────────
async function generateTASignals() {
  const newSignals = [];

  // Only run during active market hours
  if (!isMarketActive()) {
    console.log("[ENGINE] Market closed — skipping TA signals");
    return newSignals;
  }

  const session = getCurrentSession();
  console.log(`[ENGINE] Analysing pairs in ${session} session...`);

  for (const pair of MAJOR_PAIRS) {
    const ta = await runTechnicalAnalysis(pair);

    // Skip if no analysis, WAIT signal, or low confidence
    if (!ta || ta.signal === "WAIT" || ta.confidence < 70) {
      if (ta) console.log(`[TA] ${pair}: SKIPPED (${ta.signal} ${ta.confidence}%)`);
      await sleep(1000);
      continue;
    }

    // Skip duplicate signals (same pair + direction within 4 hours)
    if (isDuplicateSignal(pair, ta.signal)) {
      console.log(`[TA] ${pair}: DUPLICATE SKIPPED — ${ta.signal} already sent within 4 hours`);
      await sleep(1000);
      continue;
    }

    const entryPrice = state.prices[pair];
    if (!entryPrice) continue;

    const atr = ta.atr || (pair.includes("JPY") ? 0.45 : 0.0030);
    const sltp = calculateSLTP(pair, ta.signal, entryPrice, atr);

    const signal = {
      id: `${Date.now()}-${pair}-ta`,
      pair,
      direction: ta.signal,
      source: "TA",
      newsReason: null,
      taReason: `${session} session · ${ta.trend} trend · ${ta.pattern !== "None" ? ta.pattern + " · " : ""}RSI ~${ta.rsi_estimate} · ${ta.reasoning}`,
      confidence: ta.confidence,
      entryPrice,
      sltp,
      timeframes: ta.timeframes || null,
      session: ta.session || session,
      time: new Date().toISOString(),
      status: "active",
    };

    newSignals.push(signal);
    recordSignalTime(pair, ta.signal);
    await sendTelegramSignal(signal);
    if (typeof broadcastSignal === "function") broadcastSignal(signal);
    await sleep(1500);
  }

  return newSignals;
}

// ─── TELEGRAM BOT ─────────────────────────────────
// ─── CRYPTO TECHNICAL ANALYSIS ───────────────────
async function runCryptoAnalysis(pair) {
  try {
    const currentPrice = state.prices[pair];
    if (!currentPrice) return null;

    const coin = pair.split("/")[0];
    const session = getCurrentSession();
    const hour = new Date().getUTCHours();
    const minute = new Date().getUTCMinutes();

    // Analyse all 3 timeframes for crypto
    // useHaiku=false for manual analysis — use Sonnet for better quality
    const [tf15m, tf1h, tf4h] = await Promise.all([
      analyzeCryptoTimeframe(pair, "15min", currentPrice, session, false),
      analyzeCryptoTimeframe(pair, "1hour", currentPrice, session, false),
      analyzeCryptoTimeframe(pair, "4hour", currentPrice, session, false),
    ]);

    // 3-Timeframe Confluence
    const signals = [tf4h.signal, tf1h.signal, tf15m.signal];
    const buyCount = signals.filter(s => s === "BUY").length;
    const sellCount = signals.filter(s => s === "SELL").length;
    const waitCount = signals.filter(s => s === "WAIT").length;

    let finalSignal = "WAIT";
    let confluenceScore = 0;

    if (buyCount === 3) { finalSignal = "BUY"; confluenceScore = 100; }
    else if (sellCount === 3) { finalSignal = "SELL"; confluenceScore = 100; }
    else if (buyCount === 2 && waitCount === 1) { finalSignal = "BUY"; confluenceScore = 75; }
    else if (sellCount === 2 && waitCount === 1) { finalSignal = "SELL"; confluenceScore = 75; }
    else { finalSignal = "WAIT"; confluenceScore = 0; }

    const avgConfidence = Math.round((tf4h.confidence + tf1h.confidence + tf15m.confidence) / 3);
    const finalConfidence = finalSignal === "WAIT" ? avgConfidence :
      Math.min(95, Math.round(avgConfidence * (confluenceScore / 100) * 1.2));

    // ATR for crypto — use percentage of price
    const atr = parseFloat((currentPrice * 0.02).toFixed(currentPrice > 1000 ? 2 : 4)); // ~2% of price

    return {
      pair,
      price: currentPrice,
      signal: finalSignal,
      confidence: finalConfidence,
      trend: tf4h.trend,
      support: tf1h.support,
      resistance: tf1h.resistance,
      pattern: tf15m.pattern,
      rsi_estimate: tf1h.rsi_estimate,
      atr,
      time: new Date().toISOString(),
      session,
      assetClass: "CRYPTO",
      timeframes: {
        "4H": { signal: tf4h.signal, confidence: tf4h.confidence, trend: tf4h.trend, reasoning: tf4h.reasoning },
        "1H": { signal: tf1h.signal, confidence: tf1h.confidence, trend: tf1h.trend, reasoning: tf1h.reasoning },
        "15M": { signal: tf15m.signal, confidence: tf15m.confidence, trend: tf15m.trend, reasoning: tf15m.reasoning },
      },
      reasoning: `4H: ${tf4h.reasoning} | 1H: ${tf1h.reasoning} | 15M: ${tf15m.reasoning}`,
    };
  } catch (err) {
    console.error(`[CRYPTO TA] ${pair} error:`, err.message);
    return null;
  }
}

async function analyzeCryptoTimeframe(pair, timeframe, currentPrice, session, useHaiku = true) {
  const coin = pair.split("/")[0];
  const response = await anthropic.messages.create({
    model: useHaiku ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-5",
    max_tokens: 400,
    messages: [{ role: "user", content: `You are FXAngel, a professional crypto technical analyst.

Analyse ${pair} (${coin}) on the ${timeframe} timeframe.
Current price: $${currentPrice}
Time: ${new Date().toUTCString()}
Session: ${session}

Consider:
- ${coin} price action and momentum on ${timeframe}
- Key support/resistance for ${coin} at current price
- Market sentiment for ${coin} right now
- Crypto market correlation (BTC dominance etc)

Rules:
- Confidence must be genuine (55-95%) — NOT always 72%
- WAIT if unclear
- BUY/SELL only with clear technical reason
- Support/resistance must be realistic for ${coin}

Respond ONLY with valid JSON:
{"trend":"BULLISH","signal":"BUY","confidence":72,"support":${(currentPrice * 0.98).toFixed(2)},"resistance":${(currentPrice * 1.02).toFixed(2)},"pattern":"None","rsi_estimate":58,"reasoning":"${timeframe} specific reasoning for ${coin}"}` }],
  });

  const text = response.content[0].text.replace(/```json|```/g, "").trim();
  const analysis = JSON.parse(text);
  analysis.timeframe = timeframe;
  return analysis;
}

async function generateCryptoSignals() {
  const newSignals = [];

  // Crypto runs 24/7 — no market hours check
  console.log("[CRYPTO ENGINE] Running crypto TA signal check...");

  for (const pair of CRYPTO_PAIRS) {
    const ta = await runCryptoAnalysis(pair);

    if (!ta || ta.signal === "WAIT" || ta.confidence < 70) {
      if (ta) console.log(`[CRYPTO TA] ${pair}: SKIPPED (${ta.signal} ${ta.confidence}%)`);
      await sleep(1000);
      continue;
    }

    if (isDuplicateSignal(pair, ta.signal)) {
      console.log(`[CRYPTO TA] ${pair}: DUPLICATE SKIPPED`);
      await sleep(1000);
      continue;
    }

    const entryPrice = state.prices[pair];
    if (!entryPrice) continue;

    const sltp = calculateSLTP(pair, ta.signal, entryPrice, ta.atr);

    const signal = {
      id: `${Date.now()}-${pair}-crypto`,
      pair,
      direction: ta.signal,
      source: "TA",
      assetClass: "CRYPTO",
      newsReason: null,
      taReason: `${ta.trend} trend · ${ta.pattern !== "None" ? ta.pattern + " · " : ""}RSI ~${ta.rsi_estimate} · ${ta.reasoning}`,
      confidence: ta.confidence,
      entryPrice,
      sltp,
      timeframes: ta.timeframes,
      session: ta.session,
      time: new Date().toISOString(),
      status: "active",
    };

    newSignals.push(signal);
    recordSignalTime(pair, ta.signal);
    await sendTelegramSignal(signal);
    if (typeof broadcastSignal === "function") broadcastSignal(signal);
    await sleep(1500);
  }

  return newSignals;
}

async function sendTelegramSignal(signal) {
  if (!CONFIG.TELEGRAM_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    console.log("[TELEGRAM] Not configured — skipping notification");
    return;
  }

  const dirEmoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const sourceEmoji = signal.source === "NEWS" ? "📰" : "📊";
  const assetEmoji = signal.assetClass === "CRYPTO" ? "🪙 CRYPTO" : "💱 FX";

  // Build timeframe section if available
  let tfSection = "";
  if (signal.timeframes) {
    const tf = signal.timeframes;
    const tfEmoji = (s) => s === "BUY" ? "🟢" : s === "SELL" ? "🔴" : "⚪";
    tfSection = `
*3-Timeframe Confluence:*
${tfEmoji(tf["4H"].signal)} 4H: ${tf["4H"].signal} (${tf["4H"].confidence}%) — ${tf["4H"].trend}
${tfEmoji(tf["1H"].signal)} 1H: ${tf["1H"].signal} (${tf["1H"].confidence}%) — ${tf["1H"].trend}
${tfEmoji(tf["15M"].signal)} 15M: ${tf["15M"].signal} (${tf["15M"].confidence}%) — ${tf["15M"].trend}
`;
  }

  const message = `
👼 *FXAngel Signal* — ${assetEmoji}

${dirEmoji} *${signal.direction} ${signal.pair}*
${sourceEmoji} Source: ${signal.source}
💪 Confidence: ${signal.confidence}%
💰 Entry: \`${signal.entryPrice}\`
${signal.session ? `🕐 Session: ${signal.session}` : ""}
${tfSection}
${signal.newsReason ? `📰 *News:* ${signal.newsReason}` : ""}
${signal.taReason ? `📊 *TA:* ${signal.taReason}` : ""}

*Stop Loss / Take Profit:*
🟢 Low Risk
  └ SL: \`${signal.sltp.low.sl}\` | TP: \`${signal.sltp.low.tp}\`
🟡 Medium Risk
  └ SL: \`${signal.sltp.medium.sl}\` | TP: \`${signal.sltp.medium.tp}\`
🔴 High Risk
  └ SL: \`${signal.sltp.high.sl}\` | TP: \`${signal.sltp.high.tp}\`

ATR(14): \`${signal.sltp.atr}\`
⏰ ${new Date(signal.time).toUTCString()}
`.trim();

  try {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`[TELEGRAM] Signal sent: ${signal.direction} ${signal.pair}`);
    } else {
      console.error("[TELEGRAM] Error:", data.description);
    }
  } catch (err) {
    console.error("[TELEGRAM] Send error:", err.message);
  }
}

// ─── MAIN NEWS + SIGNAL LOOP ──────────────────────
async function runNewsSignalCheck() {
  console.log("[ENGINE] Running news signal check...");

  // Skip on weekends — market is closed
  if (!isMarketActive()) {
    console.log("[ENGINE] Weekend — skipping news signal check");
    state.lastNewsCheck = new Date().toISOString();
    return;
  }

  const ffEvents = await scrapeForexFactory();
  if (ffEvents.length > 0) state.news = ffEvents;

  // Only process news that:
  // 1. Has actual figures (released)
  // 2. Is high impact
  // 3. Was scraped within the last 10 minutes (fresh news only)
  const now = Date.now();
  const SIGNAL_DELAY_MS = 45000; // 45 seconds after detection before firing
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  const freshReleasedEvents = state.news.filter(e => {
    if (!e.released || e.impact !== "high") return false;
    if (!e.scrapedAt) return false;

    const scrapedAge = now - new Date(e.scrapedAt).getTime();

    // Must be scraped within last 10 minutes (fresh)
    // AND must be at least 45 seconds old (let market settle)
    return scrapedAge >= SIGNAL_DELAY_MS && scrapedAge <= TEN_MINUTES_MS;
  });

  if (freshReleasedEvents.length > 0) {
    console.log(`[NEWS] Found ${freshReleasedEvents.length} fresh high-impact events (45s+ old)`);
    const newsSignals = await generateNewsSignals(freshReleasedEvents);
    state.signals = [...newsSignals, ...state.signals].slice(0, 50);
    console.log(`[ENGINE] Generated ${newsSignals.length} news signals`);
  } else {
    console.log("[ENGINE] No fresh high-impact news — skipping");
  }

  state.lastNewsCheck = new Date().toISOString();
}

async function runTASignalCheck() {
  console.log("[ENGINE] Running TA signal check...");

  const taSignals = await generateTASignals();
  state.signals = [...taSignals, ...state.signals].slice(0, 50);
  console.log(`[ENGINE] Generated ${taSignals.length} TA signals`);
  state.lastTACheck = new Date().toISOString();
}

// ─── REST API ENDPOINTS ───────────────────────────

// GET /api/prices — Live prices
app.get("/api/prices", async (req, res) => {
  // Fetch fresh crypto prices on every request for real-time display
  await fetchCryptoPrices();
  res.json({ prices: state.prices, updated: new Date().toISOString() });
});

// GET /api/signals — All active signals
app.get("/api/signals", (req, res) => {
  res.json({ signals: state.signals, count: state.signals.length });
});

// GET /api/news — Economic calendar
app.get("/api/news", (req, res) => {
  res.json({ news: state.news, lastCheck: state.lastNewsCheck });
});

// GET /api/status — Engine health
app.get("/api/status", (req, res) => {
  res.json({
    status: "running",
    pairs: Object.keys(state.prices).length,
    signals: state.signals.length,
    newsEvents: state.news.length,
    lastNewsCheck: state.lastNewsCheck,
    lastTACheck: state.lastTACheck,
  });
});

// POST /api/analysis — On-demand AI analysis for a pair
app.post("/api/analysis", async (req, res) => {
  const { pair } = req.body;
  const isCrypto = CRYPTO_PAIRS.includes(pair);
  const isFX = MAJOR_PAIRS.includes(pair);

  if (!isFX && !isCrypto) {
    return res.status(400).json({ error: "Invalid pair" });
  }

  try {
    // Use appropriate analysis engine
    const analysis = isCrypto
      ? await runCryptoAnalysis(pair)
      : await runTechnicalAnalysis(pair);
    if (!analysis) return res.status(500).json({ error: "Analysis failed" });

    // Auto-generate signal if confidence >= 70% and direction is clear
    if (analysis.confidence >= 70 && analysis.signal !== "WAIT") {
      // Check for duplicate
      if (isDuplicateSignal(pair, analysis.signal)) {
        analysis.signalGenerated = false;
        analysis.duplicateReason = `${analysis.signal} ${pair} signal already sent within last 4 hours`;
        console.log(`[ANALYSIS] Duplicate blocked: ${analysis.signal} ${pair}`);
      } else {
        const atr = analysis.atr || (pair.includes("JPY") ? 0.45 : 0.0030);
        const sltp = calculateSLTP(pair, analysis.signal, parseFloat(currentPrice), atr);

        const signal = {
          id: `${Date.now()}-${pair}-ta-manual`,
          pair,
          direction: analysis.signal,
          source: "TA",
          newsReason: null,
          taReason: `${analysis.trend} trend · ${analysis.pattern !== "None" ? analysis.pattern + " · " : ""}RSI ~${analysis.rsi_estimate} · ${analysis.reasoning}`,
          confidence: analysis.confidence,
          entryPrice: currentPrice,
          sltp,
          timeframes: analysis.timeframes || null,
          session: analysis.session || getCurrentSession(),
          time: new Date().toISOString(),
          status: "active",
        };

        state.signals = [signal, ...state.signals].slice(0, 50);
        await sendTelegramSignal(signal);
        recordSignalTime(pair, analysis.signal);

        analysis.signalGenerated = true;
        analysis.signal_id = signal.id;
        console.log(`[ANALYSIS] Signal generated: ${analysis.signal} ${pair} @ ${analysis.confidence}% confidence`);
      }
    }

    res.json({ analysis });
  } catch (err) {
    console.error("[ANALYSIS] Error:", err.message);
    res.status(500).json({ error: "Analysis failed" });
  }
});

// POST /api/telegram/test — Send a test message
app.post("/api/telegram/test", async (req, res) => {
  const { token, chatId } = req.body;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "👼 *FXAngel* connected successfully! You will receive trading signals here.",
        parse_mode: "Markdown",
      }),
    });
    const data = await r.json();
    if (data.ok) res.json({ success: true });
    else res.status(400).json({ error: data.description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SCHEDULED JOBS ───────────────────────────────

// FX Prices: every 2 seconds (Finnhub batch — 30 calls/min, limit is 50)
setInterval(fetchPrices, CONFIG.FX_PRICE_INTERVAL_MS);

// Crypto Prices: every second (Binance batch — 1 call/sec)
setInterval(fetchCryptoPrices, CONFIG.CRYPTO_PRICE_INTERVAL_MS);

// News signals: every 30 seconds
setInterval(runNewsSignalCheck, CONFIG.NEWS_INTERVAL_MS);

// FX TA signals: every 15 minutes
setInterval(runTASignalCheck, CONFIG.TA_INTERVAL_MS);

// Crypto TA signals: every 15 minutes
setInterval(async () => {
  const cryptoSignals = await generateCryptoSignals();
  state.signals = [...cryptoSignals, ...state.signals].slice(0, 100);
  console.log(`[CRYPTO ENGINE] Generated ${cryptoSignals.length} crypto signals`);
}, CONFIG.TA_INTERVAL_MS);

// ─── STARTUP ──────────────────────────────────────
async function startup() {
  console.log("👼 FXAngel Signal Engine starting...");
  console.log("[SERVER] FX pairs:", MAJOR_PAIRS.length);
  console.log("[SERVER] Crypto pairs:", CRYPTO_PAIRS.length);

  // Fetch FX and crypto prices simultaneously
  await Promise.all([fetchPrices(), fetchCryptoPrices()]);
  console.log("[SERVER] FX prices: every 2 seconds via Finnhub");
  console.log("[SERVER] Crypto prices: every second via Binance");

  // Run news check immediately
  await runNewsSignalCheck();

  // Run TA checks after 10 seconds
  setTimeout(async () => {
    await runTASignalCheck();
    const cryptoSignals = await generateCryptoSignals();
    state.signals = [...cryptoSignals, ...state.signals].slice(0, 100);
    console.log("[ENGINE] Initial checks complete — recurring every 15 minutes");
  }, 10000);

  console.log(`[SERVER] Listening on port ${CONFIG.PORT}`);
  console.log(`[SERVER] TA interval: ${CONFIG.TA_INTERVAL_MS / 60000} minutes`);
  console.log(`[SERVER] News interval: ${CONFIG.NEWS_INTERVAL_MS / 1000} seconds`);
  console.log(`[SERVER] Price interval: ${CONFIG.PRICE_INTERVAL_MS / 1000} seconds`);
}

const server = app.listen(CONFIG.PORT, () => startup());

// ─── WEBSOCKET SERVER ─────────────────────────────
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected — total: ${clients.size}`);

  // Send current prices immediately on connect
  ws.send(JSON.stringify({ type: "prices", data: state.prices }));

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected — total: ${clients.size}`);
  });

  ws.on("error", () => clients.delete(ws));
});

// Broadcast prices to all connected clients
function broadcastPrices() {
  if (clients.size === 0) return;
  const message = JSON.stringify({ type: "prices", data: state.prices });
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Broadcast signals to all connected clients
function broadcastSignal(signal) {
  if (clients.size === 0) return;
  const message = JSON.stringify({ type: "signal", data: signal });
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Broadcast prices every second
setInterval(broadcastPrices, 1000);

// ─── UTILS ────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
