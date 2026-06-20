// ─────────────────────────────────────────────────────────────
// netlify/functions/_fanzaLib.js
// FANZA API 変換ロジック（Netlify Functions 共通）
// server/index.js と同じロジックを ESM/CJS 両対応で提供する。
// ─────────────────────────────────────────────────────────────

const https = require("https");

// ── 環境変数 ──────────────────────────────────────────────────
const MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED === "true";
const OUTBOUND_LINK_MODE   = process.env.OUTBOUND_LINK_MODE || "normal";

const FANZA_DEFAULTS = {
  site:    process.env.FANZA_SITE    || "FANZA",
  service: process.env.FANZA_SERVICE || "digital",
  floor:   process.env.FANZA_FLOOR   || "videoa",
  sort:    process.env.FANZA_SORT    || "date",
};

const EXCLUDE_FREE_ITEMS = process.env.EXCLUDE_FREE_ITEMS !== "false";
const MAX_FETCH_PAGES    = Math.max(Number(process.env.MAX_FETCH_PAGES) || 3, 1);

// ── URL/送出ヘルパー ──────────────────────────────────────────
function resolveOutboundUrl(normalURL, affiliateURL) {
  if (MONETIZATION_ENABLED && OUTBOUND_LINK_MODE === "affiliate") {
    return affiliateURL || normalURL || "";
  }
  return normalURL || "";
}

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

// ── 無料判定 ──────────────────────────────────────────────────
function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isZeroOrFreePrice(priceVal) {
  if (priceVal === undefined || priceVal === null) return false;
  const s = String(priceVal).trim();
  if (s === "") return false;
  if (s.includes("無料")) return true;
  if (/[〜~]/.test(s)) return false; // "300〜" は有料扱い
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
    deliveryPrice: firstDelivery.price !== undefined && firstDelivery.price !== null ? String(firstDelivery.price) : "",
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

// ── item → カード変換 ─────────────────────────────────────────
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
    id:           item.content_id || item.product_id || item.contentId || String(item.title),
    title:        item.title || "タイトル不明",
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
    tags:         genres.slice(0, 3),
    sourceType:   "fanza",
  };
}

// ── HTTPS GET（Promise）───────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "EroPick/0.3" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ── FANZAサンプル取得のメイン処理 ─────────────────────────────
async function getFanzaSamples(query) {
  const apiId       = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId) {
    return { status: 500, body: { error: "サーバーに API キーが設定されていません。" } };
  }

  const hits    = Math.min(Number(query.hits)   || 20, 100);
  const offset  = Math.max(Number(query.offset) || 1,  1);
  const site    = query.site    || FANZA_DEFAULTS.site;
  const service = query.service || FANZA_DEFAULTS.service;
  const floor   = query.floor   || FANZA_DEFAULTS.floor;
  const sort    = query.sort    || FANZA_DEFAULTS.sort;
  const keyword = query.keyword || "";
  const queryInfo = { site, service, floor, sort, keyword };

  const fetchPerPage = 100;
  let totalItems = 0, totalSampleFound = 0, totalFreeExcluded = 0, apiTotalCount = 0;
  const collected = [];
  const seenIds = new Set();

  for (let page = 0; page < MAX_FETCH_PAGES && collected.length < hits; page++) {
    const pageOffset = offset + page * fetchPerPage;
    const params = new URLSearchParams({
      api_id: apiId, affiliate_id: affiliateId,
      site, service, floor, sort,
      hits: String(fetchPerPage), offset: String(pageOffset), output: "json",
    });
    if (keyword) params.set("keyword", keyword);

    const dmmUrl = `https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`;
    const raw    = await fetchUrl(dmmUrl);
    const data   = JSON.parse(raw);

    if (data.result?.status !== 200) {
      return { status: 502, body: { error: `FANZA API エラー: status=${data.result?.status}` } };
    }

    const items = data.result?.items ?? [];
    apiTotalCount = data.result?.total_count ?? apiTotalCount;
    totalItems += items.length;

    for (const item of items) {
      if (!resolveSampleMovie(item).videoSrc) continue;
      totalSampleFound++;
      if (EXCLUDE_FREE_ITEMS && isFreeItem(item)) { totalFreeExcluded++; continue; }
      const card = itemToCard(item);
      if (!card || seenIds.has(card.id)) continue;
      seenIds.add(card.id);
      collected.push(card);
      if (collected.length >= hits) break;
    }
    if (items.length < fetchPerPage) break;
  }

  const cards = collected.slice(0, hits);
  const firstCard = cards[0] || null;
  return {
    status: 200,
    body: {
      cards, total: apiTotalCount, offset, hits, query: queryInfo,
      debug: {
        itemsCount: totalItems,
        sampleMovieFound: totalSampleFound,
        freeExcludedCount: totalFreeExcluded,
        paidCandidateCount: cards.length,
        cardsCount: cards.length,
        firstItemPrice: firstCard?.price ?? "",
        firstItemDeliveryPrice: firstCard?.deliveryPrice ?? "",
      },
    },
  };
}

// ── フロア一覧取得 ─────────────────────────────────────────────
async function getFanzaFloors() {
  const apiId       = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId) {
    return { status: 500, body: { error: "サーバーに API キーが設定されていません。" } };
  }
  const params = new URLSearchParams({ api_id: apiId, affiliate_id: affiliateId, output: "json" });
  const url = `https://api.dmm.com/affiliate/v3/FloorList?${params.toString()}`;
  const raw  = await fetchUrl(url);
  const data = JSON.parse(raw);
  const sites = data.result?.site ?? [];
  const fanza = sites.find((s) => s.name === "FANZA" || s.code === "FANZA") || null;
  if (!fanza) return { status: 200, body: { site: "FANZA", services: [] } };
  const services = (fanza.service ?? []).map((svc) => ({
    name: svc.name, code: svc.code,
    floors: (svc.floor ?? []).map((fl) => ({ name: fl.name, code: fl.code })),
  }));
  return { status: 200, body: { site: "FANZA", services } };
}

module.exports = { getFanzaSamples, getFanzaFloors };
