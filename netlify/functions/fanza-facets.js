// netlify/functions/fanza-facets.js
// ジャンル / 女優 / メーカーの一覧を1リクエストでまとめて返す
const { getFanzaFacets } = require("../../server/lib/fanzaClient.js");

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  try {
    const result = await getFanzaFacets(query);
    return { statusCode: result.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.body) };
  } catch (err) {
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "ジャンル/女優/メーカー一覧の取得に失敗しました。", detail: err.message }) };
  }
};
