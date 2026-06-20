// ─────────────────────────────────────────────────────────────
// src/config/appConfig.js
// アプリ全体の設定を1か所で管理する。
// ブランド名・収益化設定は必ずここを参照すること（ハードコード禁止）。
// ─────────────────────────────────────────────────────────────

export const appConfig = {
  // 表示用サービス名。名前を変えるときはここだけ変更する。
  appName: "EroPick",

  // 収益化フラグ。現時点では必ず false。
  monetizationEnabled: false,

  // 送出リンクのモード: "normal" | "affiliate"
  // 現時点では必ず "normal"。
  outboundLinkMode: "normal",

  // API エンドポイントのベース
  // 本番（Netlify）では /.netlify/functions、開発では /api
  apiBase: import.meta.env.PROD ? "/.netlify/functions" : "/api",
};

/**
 * カードから実際にフロントで使う送出URLを返す。
 * URL選択ロジックは各所に直書きせず、必ずこの関数を通すこと。
 *
 * - 収益化OFF（monetizationEnabled=false）なら絶対に通常リンクを返す
 * - 収益化ONかつ outboundLinkMode="affiliate" のときだけ affiliateURL を使う
 *
 * @param {object} card - normalURL / affiliateURL / URL などを持つカード
 * @returns {string} 送出先URL（なければ空文字）
 */
export function getOutboundUrl(card) {
  if (!card) return "";

  // 収益化OFF: 必ず通常リンク
  if (!appConfig.monetizationEnabled) {
    return card.normalURL || card.URL || "";
  }

  // 収益化ON かつ アフィリエイトモードのときだけアフィリエイトリンク
  if (appConfig.outboundLinkMode === "affiliate") {
    return card.affiliateURL || card.normalURL || card.URL || "";
  }

  // それ以外は通常リンク
  return card.normalURL || card.URL || "";
}
