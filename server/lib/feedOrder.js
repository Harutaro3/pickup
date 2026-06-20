// ─────────────────────────────────────────────────────────────
// server/lib/feedOrder.js
// フィード表示順並び替えロジック
// ─────────────────────────────────────────────────────────────

const DIVERSE_LOOKBACK  = Math.max(Number(process.env.DIVERSE_LOOKBACK) || 6, 1);
const FEED_ORDER_MODE   = process.env.FEED_ORDER_MODE || "diverse";

/** Fisher-Yates シャッフル */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 2つの配列に共通要素があるか判定 */
function hasIntersection(a, b) {
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  return b.some((v) => setA.has(v));
}

/**
 * カードと直近履歴のペナルティスコアを計算する。
 * 距離が近いほど重みが大きい（直前のカードが最も影響する）。
 */
function diversityPenalty(card, recent) {
  let score = 0;
  for (let i = 0; i < recent.length; i++) {
    const prev          = recent[i];
    const distanceWeight = recent.length - i;
    if (card.maker  && prev.maker  && card.maker  === prev.maker)  score += 100 * distanceWeight;
    if (card.series && prev.series && card.series === prev.series) score +=  80 * distanceWeight;
    if (hasIntersection(card.actresses || [], prev.actresses || [])) score += 60 * distanceWeight;
    if (hasIntersection(card.genres    || [], prev.genres    || [])) score += 10;
  }
  return score;
}

/**
 * 直近 DIVERSE_LOOKBACK 件を見てペナルティを計算し、
 * 同メーカー・シリーズ・女優が連続しにくい並び替えを行う。
 */
function reorderDiverse(cards, lookback) {
  const lb   = lookback ?? DIVERSE_LOOKBACK;
  const pool = shuffleArray(cards);
  const result = [];

  while (pool.length > 0) {
    const recent = result.slice(-lb);
    let bestIndexes = [];
    let bestScore   = Infinity;

    for (let i = 0; i < pool.length; i++) {
      const s = diversityPenalty(pool[i], recent);
      if (s < bestScore)        { bestScore = s; bestIndexes = [i]; }
      else if (s === bestScore) { bestIndexes.push(i); }
    }

    const chosen = bestIndexes[Math.floor(Math.random() * bestIndexes.length)];
    result.push(pool.splice(chosen, 1)[0]);
  }

  return result;
}

/** order モードに応じてカード配列を並び替える */
function applyFeedOrder(cards, order) {
  switch (order) {
    case "random":  return shuffleArray(cards);
    case "diverse": return reorderDiverse(cards);
    default:        return cards;
  }
}

/** 連続同メーカー最大数を計算 */
function calcMaxConsecutiveSameMaker(cards) {
  let max = 1, cur = 1;
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].maker && cards[i].maker === cards[i - 1].maker) {
      cur++; if (cur > max) max = cur;
    } else { cur = 1; }
  }
  return cards.length ? max : 0;
}

/** メーカー出現回数 上位N件 */
function topMakerCounts(cards, n = 5) {
  const counts = {};
  for (const c of cards) { if (c.maker) counts[c.maker] = (counts[c.maker] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

module.exports = {
  DIVERSE_LOOKBACK, FEED_ORDER_MODE,
  shuffleArray, hasIntersection, diversityPenalty,
  reorderDiverse, applyFeedOrder,
  calcMaxConsecutiveSameMaker, topMakerCounts,
};
