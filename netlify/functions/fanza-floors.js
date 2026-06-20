// netlify/functions/fanza-floors.js
const { getFanzaFloors } = require("../../server/lib/fanzaClient.js");

exports.handler = async () => {
  try {
    const result = await getFanzaFloors();
    return { statusCode: result.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.body) };
  } catch (err) {
    return { statusCode: 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "フロア一覧の取得に失敗しました。", detail: err.message }) };
  }
};
