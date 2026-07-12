// netlify/functions/fanza-genres.js
const { getFanzaGenres } = require("../../server/lib/fanzaClient.js");

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  try {
    const result = await getFanzaGenres(query);
    return { statusCode: result.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.body) };
  } catch (err) {
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "ジャンル一覧の取得に失敗しました。", detail: err.message }) };
  }
};
