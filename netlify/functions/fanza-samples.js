// netlify/functions/fanza-samples.js
const { getFanzaSamples, buildMockCards } = require("../../server/lib/fanzaClient.js");

exports.handler = async (event) => {
  const query    = event.queryStringParameters || {};
  const USE_MOCK = process.env.USE_MOCK_FANZA === "true";
  const hits     = Math.min(Number(query.hits) || 20, 100);
  const offset   = Math.max(Number(query.offset) || 1, 1);

  if (query.mode === "error") {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "テスト用エラー" }) };
  }
  if (query.mode === "empty") {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards: [], total: 0, offset, hits }) };
  }

  try {
    if (USE_MOCK) {
      const cards = buildMockCards(hits, offset);
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards, total: 999, offset, hits }) };
    }
    const result = await getFanzaSamples(query);
    return { statusCode: result.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.body) };
  } catch (err) {
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "FANZA API への接続に失敗しました。", detail: err.message }) };
  }
};
