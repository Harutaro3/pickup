/**
 * EroPick — server/index.js
 * ローカル開発用 Express サーバー
 * 本番（Netlify）では netlify/functions/ を使う
 */

const express = require("express");

try { require("dotenv").config(); } catch {}

const { getFanzaSamples, getFanzaFloors, buildMockCards } = require("./lib/fanzaClient.js");

const app      = express();
const PORT     = process.env.PORT || 3001;
const USE_MOCK = process.env.USE_MOCK_FANZA === "true";

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin",  "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── ヘルスチェック ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "0.3", mock: USE_MOCK });
});

// ── FANZA サンプル取得 ─────────────────────────────────────────
app.get("/api/fanza-samples", async (req, res) => {
  const query  = req.query;
  const hits   = Math.min(Number(query.hits) || 20, 100);
  const offset = Math.max(Number(query.offset) || 1, 1);
  const mode   = query.mode || "";

  if (mode === "error") return res.status(500).json({ error: "テスト用エラー" });
  if (mode === "empty") return res.json({ cards: [], total: 0, offset, hits });

  if (USE_MOCK) {
    const cards = buildMockCards(hits, offset);
    return res.json({ cards, total: 999, offset, hits });
  }

  try {
    const result = await getFanzaSamples(query);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[server] error:", err);
    res.status(502).json({ error: "FANZA API への接続に失敗しました。", detail: err.message });
  }
});

// ── フロア一覧 ─────────────────────────────────────────────────
app.get("/api/fanza-floors", async (req, res) => {
  try {
    const result = await getFanzaFloors();
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[server] floors error:", err);
    res.status(502).json({ error: "フロア一覧の取得に失敗しました。" });
  }
});

// ── 起動 ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  const { MONETIZATION_ENABLED, OUTBOUND_LINK_MODE } = require("./lib/linkMode.js");
  const { FEED_ORDER_MODE, DIVERSE_LOOKBACK }        = require("./lib/feedOrder.js");
  console.log(`[server] EroPick API  http://localhost:${PORT}`);
  console.log(`[server] MODE: ${USE_MOCK ? "🟡 MOCK" : "🟢 REAL API"}`);
  console.log(`[server] 収益化: ${MONETIZATION_ENABLED ? "ON" : "OFF"} / link: ${OUTBOUND_LINK_MODE}`);
  console.log(`[server] order: ${FEED_ORDER_MODE} / lookback: ${DIVERSE_LOOKBACK}`);
  console.log(`[server] DMM_API_ID       = ${process.env.DMM_API_ID       ? "✓ set" : "✗ NOT SET"}`);
  console.log(`[server] DMM_AFFILIATE_ID = ${process.env.DMM_AFFILIATE_ID ? "✓ set" : "✗ NOT SET"}`);
});
