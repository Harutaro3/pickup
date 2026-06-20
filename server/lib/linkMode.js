// ─────────────────────────────────────────────────────────────
// server/lib/linkMode.js
// 収益化モード・リンク選択ロジック
// ─────────────────────────────────────────────────────────────

const MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED === "true";
const OUTBOUND_LINK_MODE    = process.env.OUTBOUND_LINK_MODE || "normal";

/**
 * 収益化設定に応じて送出URLを決定する。
 * MONETIZATION_ENABLED=false の場合、必ず normalURL を返す。
 * true かつ affiliate モードのときのみ affiliateURL を使う。
 */
function resolveOutboundUrl(normalURL, affiliateURL) {
  if (MONETIZATION_ENABLED && OUTBOUND_LINK_MODE === "affiliate") {
    return affiliateURL || normalURL || "";
  }
  return normalURL || "";
}

module.exports = { resolveOutboundUrl, MONETIZATION_ENABLED, OUTBOUND_LINK_MODE };
