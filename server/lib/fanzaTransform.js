// ─────────────────────────────────────────────────────────────
// server/lib/fanzaTransform.js
// FANZA API レスポンス → QuickPickカード変換
// ─────────────────────────────────────────────────────────────

const { resolveOutboundUrl } = require("./linkMode.js");

// ── URL正規化 ──────────────────────────────────────────────────
function toHttps(url) {
  if (typeof url !== "string") return url;
  return url.replace(/^http:\/\//i, "https://");
}

function isLikelyDirectVideo(url) {
  if (typeof url !== "string") return false;
  return /\.(mp4|m3u8|webm|mov)(\?|$)/i.test(url);
}

function pickField(item, keys) {
  for (const k of keys) {
    if (item[k] !== undefined && item[k] !== null && item[k] !== "") return item[k];
  }
  return null;
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// ── サンプル動画URL解決 ───────────────────────────────────────
function resolveSampleMovie(item) {
  const movieUrl =
    item.sampleMovieURL ||
    item.sample_movie_url ||
    item.sampleMovieUrl ||
    null;

  if (!movieUrl) return { videoSrc: null, sampleType: null };

  if (typeof movieUrl === "string") {
    return {
      videoSrc:   toHttps(movieUrl),
      sampleType: isLikelyDirectVideo(movieUrl) ? "video" : "iframe",
    };
  }

  if (typeof movieUrl === "object") {
    const url =
      movieUrl.size_720_480 ||
      movieUrl.size_644_414 ||
      movieUrl.size_560_360 ||
      movieUrl.size_476_306 ||
      movieUrl.pc ||
      movieUrl.sp ||
      Object.values(movieUrl).find((v) => typeof v === "string" && v) ||
      null;
    if (!url) return { videoSrc: null, sampleType: null };
    return {
      videoSrc:   toHttps(url),
      sampleType: isLikelyDirectVideo(url) ? "video" : "iframe",
    };
  }

  return { videoSrc: null, sampleType: null };
}

// ── 価格情報 ──────────────────────────────────────────────────
function isZeroOrFreePrice(priceVal) {
  if (priceVal === undefined || priceVal === null) return false;
  const s = String(priceVal).trim();
  if (s === "") return false;
  if (s.includes("無料")) return true;
  if (/[〜~]/.test(s)) return false;
  const num = Number(s.replace(/[^\d]/g, ""));
  if (s.replace(/[^\d]/g, "") !== "" && num === 0) return true;
  return false;
}

function extractPriceInfo(item) {
  const price = item.prices?.price ?? item.price?.price ?? "";
  const deliveries = normalizeArray(item.prices?.deliveries?.delivery ?? item.deliveries?.delivery);
  const firstDelivery = deliveries[0] || {};
  return {
    price:         price !== undefined && price !== null ? String(price) : "",
    deliveryPrice: firstDelivery.price !== undefined ? String(firstDelivery.price) : "",
    deliveryType:  firstDelivery.type || "",
  };
}

function isFreeItem(item) {
  const title = item.title || "";
  const url   = (item.URL || item.url || "").toLowerCase();
  if (title.includes("無料")) return true;
  if (url.includes("/free") || url.includes("freemovie")) return true;
  const price = item.prices?.price ?? item.price?.price;
  if (isZeroOrFreePrice(price)) return true;
  const deliveries = normalizeArray(item.prices?.deliveries?.delivery ?? item.deliveries?.delivery);
  if (deliveries.length > 0 && deliveries.every((d) => isZeroOrFreePrice(d.price))) return true;
  return false;
}

// ── item → カード ─────────────────────────────────────────────
function itemToCard(item) {
  const { videoSrc, sampleType } = resolveSampleMovie(item);
  if (!videoSrc) return null;

  const imageObj = pickField(item, ["imageURL", "image_url", "imageUrl"]);
  let imageUrl = null;
  if (imageObj && typeof imageObj === "object") {
    imageUrl = imageObj.large || imageObj.small || imageObj.list || null;
  } else if (typeof imageObj === "string") {
    imageUrl = imageObj;
  }
  imageUrl = imageUrl ? toHttps(imageUrl) : null;

  const info      = item.iteminfo || item.itemInfo || {};
  const actresses = (info.actress ?? []).map((a) => a.name).filter(Boolean);
  const genres    = (info.genre   ?? []).map((g) => g.name).filter(Boolean);
  const maker     = info.maker?.[0]?.name  || "";
  const series    = info.series?.[0]?.name || "";

  const normalURL    = toHttps(pickField(item, ["URL", "url"]) || "");
  const affRaw       = pickField(item, ["affiliateURL", "affiliate_url", "affiliateUrl"]);
  const affiliateURL = toHttps(affRaw || normalURL || "");
  const outboundURL  = resolveOutboundUrl(normalURL, affiliateURL);
  const priceInfo    = extractPriceInfo(item);

  return {
    id:            item.content_id || item.product_id || item.contentId || String(item.title),
    title:         item.title || "タイトル不明",
    videoSrc,
    sampleType,
    imageUrl,
    normalURL,
    affiliateURL,
    outboundURL,
    price:         priceInfo.price,
    deliveryPrice: priceInfo.deliveryPrice,
    deliveryType:  priceInfo.deliveryType,
    actresses,
    genres,
    maker,
    series,
    tags:          genres.slice(0, 3),
    sourceType:    "fanza",
  };
}

module.exports = {
  resolveSampleMovie, isFreeItem, itemToCard,
  toHttps, pickField, normalizeArray,
};
