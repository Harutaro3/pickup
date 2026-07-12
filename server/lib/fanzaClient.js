// ─────────────────────────────────────────────────────────────
// server/lib/fanzaClient.js  v1.0
// FANZA API への HTTP リクエストとモックカード生成
//
// v1.0 変更点：
//   ランダム取得時、カタログの離れた「複数地点」から少しずつ
//   サンプリングする方式に変更（マルチポイントサンプリング）。
//   旧方式は単一ランダム地点から連続100〜300件を取得していたため、
//   同日リリースの同ジャンル群（カタログ上で隣接）に偏っていた。
// ─────────────────────────────────────────────────────────────

const https = require("https");
const { isFreeItem, itemToCard, resolveSampleMovie } = require("./fanzaTransform.js");
const { resolveOutboundUrl } = require("./linkMode.js");
const { applyFeedOrder, calcMaxConsecutiveSameMaker, topMakerCounts, DIVERSE_LOOKBACK } = require("./feedOrder.js");

const EXCLUDE_FREE_ITEMS      = process.env.EXCLUDE_FREE_ITEMS !== "false";
const MAX_FETCH_PAGES         = Math.max(Number(process.env.MAX_FETCH_PAGES) || 3, 1);
const FANZA_RANDOM_OFFSET     = process.env.FANZA_RANDOM_OFFSET !== "false";
const FANZA_RANDOM_OFFSET_MAX = Math.min(Number(process.env.FANZA_RANDOM_OFFSET_MAX) || 5000, 50000);
// ランダム取得時に何地点からサンプリングするか（多いほど分散、APIコール増）
const FANZA_SAMPLE_POINTS     = Math.min(Math.max(Number(process.env.FANZA_SAMPLE_POINTS) || 4, 1), 8);

const FANZA_DEFAULTS = {
  site:    process.env.FANZA_SITE    || "FANZA",
  service: process.env.FANZA_SERVICE || "digital",
  floor:   process.env.FANZA_FLOOR   || "videoa",
  sort:    process.env.FANZA_SORT    || "date",
};

// ── HTTPS GET ────────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "EroPick/1.0" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/** Fisher-Yates シャッフル */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 重複しないランダムオフセットを n 個生成（互いに最低200離す） */
function pickSamplePoints(n, max) {
  const points = [];
  let guard = 0;
  while (points.length < n && guard < 100) {
    guard++;
    const p = Math.floor(Math.random() * max) + 1;
    if (points.every((q) => Math.abs(q - p) >= 200)) points.push(p);
  }
  // 足りなければ間隔条件を捨てて埋める
  while (points.length < n) points.push(Math.floor(Math.random() * max) + 1);
  return points;
}

// ── FANZAサンプル取得（メイン処理）──────────────────────────────
async function getFanzaSamples(query) {
  const apiId       = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId) {
    return { status: 500, body: { error: "サーバーに API キーが設定されていません。" } };
  }

  const hits    = Math.min(Number(query.hits)   || 20, 100);
  const site    = query.site    || FANZA_DEFAULTS.site;
  const service = query.service || FANZA_DEFAULTS.service;
  const floor   = query.floor   || FANZA_DEFAULTS.floor;
  const sort    = query.sort    || FANZA_DEFAULTS.sort;
  const keyword = query.keyword || "";
  const order   = (["api","random","diverse"].includes(query.order)) ? query.order : (process.env.FEED_ORDER_MODE || "diverse");

  // ── 複数選択フィルタ（ジャンル / 女優 / メーカー）─────────────
  //   同一カテゴリ内は OR、カテゴリをまたぐと AND。
  //   例：ジャンル(巨乳 or 人妻) かつ 女優(○○) → 2カテゴリ×IDで直積を作り、
  //       各組み合わせを並列取得してから均等に混ぜる。
  const parseIdList = (raw) => (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
  const genreIds    = parseIdList(query.genreIds ?? query.genreId); // genreId は旧単数指定との後方互換
  const actressIds  = parseIdList(query.actressIds);
  const makerIds    = parseIdList(query.makerIds);

  const activeCategories = [];
  if (genreIds.length)   activeCategories.push({ type: "genre",   ids: genreIds });
  if (actressIds.length) activeCategories.push({ type: "actress", ids: actressIds });
  if (makerIds.length)   activeCategories.push({ type: "maker",   ids: makerIds });

  const MAX_FILTER_COMBOS = 6; // API呼び出し数の上限（組み合わせが多すぎる場合はランダムに間引く）
  function cartesianCombos(categories, cap) {
    if (categories.length === 0) return [[]];
    let combos = [[]];
    for (const cat of categories) {
      const next = [];
      for (const combo of combos) {
        for (const id of cat.ids) next.push([...combo, { type: cat.type, id }]);
      }
      combos = next;
    }
    return combos.length > cap ? shuffle(combos).slice(0, cap) : combos;
  }
  function buildArticleParams(combo) {
    if (combo.length === 0) return {};
    return { article: combo.map((c) => c.type).join(","), article_id: combo.map((c) => c.id).join(",") };
  }

  const isFiltered = activeCategories.length > 0;
  const useRandom  = query.random !== "false" && FANZA_RANDOM_OFFSET;

  // ── 取得地点の決定 ──────────────────────────────────────────
  //   フィルタあり：組み合わせごとに1地点
  //   フィルタなし・ランダム：離れた複数地点（マルチポイントサンプリング）
  //   フィルタなし・通常：指定オフセットから連続ページング（fetchMore用）
  const combos  = isFiltered ? cartesianCombos(activeCategories, MAX_FILTER_COMBOS) : [[]];
  const offsets = isFiltered
    ? pickSamplePoints(combos.length, FANZA_RANDOM_OFFSET_MAX)
    : useRandom
      ? pickSamplePoints(FANZA_SAMPLE_POINTS, FANZA_RANDOM_OFFSET_MAX)
      : [Math.max(Number(query.offset) || 1, 1)];

  const queryInfo = {
    site, service, floor, sort, keyword,
    genreIds, actressIds, makerIds, combosUsed: combos.length,
    offsetUsed: offsets[0], samplePoints: offsets, random: useRandom, order,
  };
  const fetchPerPage = 100;

  let totalItems = 0, totalSampleFound = 0, totalFreeExcluded = 0, totalDuplicateExcluded = 0, apiTotalCount = 0;
  const seenSet = new Set();

  function addToSeen(card) {
    if (card.id)        seenSet.add(`id:${card.id}`);
    if (card.videoSrc)  seenSet.add(`v:${card.videoSrc}`);
    if (card.normalURL) seenSet.add(`u:${card.normalURL}`);
  }
  function isSeenCard(card) {
    if (card.id        && seenSet.has(`id:${card.id}`))       return true;
    if (card.videoSrc  && seenSet.has(`v:${card.videoSrc}`))  return true;
    if (card.normalURL && seenSet.has(`u:${card.normalURL}`)) return true;
    return false;
  }

  /** 1ページ分を取得してカード化（重複・無料・サンプル無しを除外） */
  async function fetchPage(pageOffset, extraParams = {}) {
    const params = new URLSearchParams({
      api_id: apiId, affiliate_id: affiliateId,
      site, service, floor, sort,
      hits: String(fetchPerPage), offset: String(pageOffset), output: "json",
    });
    if (keyword) params.set("keyword", keyword);
    for (const [k, v] of Object.entries(extraParams)) params.set(k, v);

    const raw  = await fetchUrl(`https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`);
    const data = JSON.parse(raw);
    if (data.result?.status !== 200) {
      throw new Error(`FANZA API エラー: status=${data.result?.status}`);
    }

    const items = data.result?.items ?? [];
    apiTotalCount = data.result?.total_count ?? apiTotalCount;
    totalItems   += items.length;

    const pageCards = [];
    for (const item of items) {
      if (!resolveSampleMovie(item).videoSrc) continue;
      totalSampleFound++;
      if (EXCLUDE_FREE_ITEMS && isFreeItem(item)) { totalFreeExcluded++; continue; }
      const card = itemToCard(item);
      if (!card) continue;
      if (isSeenCard(card)) { totalDuplicateExcluded++; continue; }
      addToSeen(card);
      pageCards.push(card);
    }
    return { pageCards, itemsCount: items.length };
  }

  const collected = [];

  try {
    if (isFiltered) {
      // ── フィルタモード：組み合わせごとに並列取得して均等に混ぜる ──
      const perCombo = Math.ceil(hits / combos.length) + 3;
      const results  = await Promise.all(
        combos.map((combo, i) =>
          fetchPage(offsets[i], buildArticleParams(combo)).catch(() => ({ pageCards: [], itemsCount: 0 }))
        )
      );
      const pools = results.map((r) => shuffle(r.pageCards).slice(0, perCombo));
      let added = true;
      while (collected.length < hits && added) {
        added = false;
        for (const pool of pools) {
          if (pool.length === 0) continue;
          collected.push(pool.shift());
          added = true;
          if (collected.length >= hits) break;
        }
      }
    } else if (useRandom) {
      // ── マルチポイントサンプリング ────────────────────────────
      //   各地点から並列で1ページずつ取得し、各地点から均等に採用。
      //   地点ごとの上限 = ceil(hits / 地点数) + 少し余裕。
      const perPoint = Math.ceil(hits / offsets.length) + 3;
      const results  = await Promise.all(
        offsets.map((off) => fetchPage(off).catch(() => ({ pageCards: [], itemsCount: 0 })))
      );

      // 各地点の結果をシャッフルし、ラウンドロビンで均等に混ぜる
      const pools = results.map((r) => shuffle(r.pageCards).slice(0, perPoint));
      let added = true;
      while (collected.length < hits && added) {
        added = false;
        for (const pool of pools) {
          if (pool.length === 0) continue;
          collected.push(pool.shift());
          added = true;
          if (collected.length >= hits) break;
        }
      }
    } else {
      // ── 従来の連続ページング（fetchMore用）──────────────────
      const startOffset = offsets[0];
      for (let page = 0; page < MAX_FETCH_PAGES && collected.length < hits; page++) {
        const { pageCards, itemsCount } = await fetchPage(startOffset + page * fetchPerPage);
        for (const card of pageCards) {
          collected.push(card);
          if (collected.length >= hits) break;
        }
        if (itemsCount < fetchPerPage) break;
      }
    }
  } catch (err) {
    return { status: 502, body: { error: err.message } };
  }

  const rawCards   = collected.slice(0, hits);
  const cards      = applyFeedOrder(rawCards, order);
  const nextOffset = (isFiltered || useRandom)
    ? Math.floor(Math.random() * FANZA_RANDOM_OFFSET_MAX) + 1  // 次回fetchMoreの起点もランダムに
    : offsets[0] + MAX_FETCH_PAGES * fetchPerPage;
  const makerList  = [...new Set(cards.map((c) => c.maker).filter(Boolean))];

  return {
    status: 200,
    body: {
      cards, total: apiTotalCount, offset: offsets[0], hits, query: queryInfo,
      debug: {
        rawItemsCount: totalItems, sampleMovieFoundCount: totalSampleFound,
        freeExcludedCount: totalFreeExcluded, duplicateExcludedCount: totalDuplicateExcluded,
        cardsCount: cards.length, order, shuffled: order !== "api",
        uniqueMakersCount: makerList.length,
        topMakers: topMakerCounts(cards),
        maxConsecutiveSameMaker: calcMaxConsecutiveSameMaker(cards),
        diverseLookback: DIVERSE_LOOKBACK,
        samplePoints: offsets, offsetUsed: offsets[0], nextOffset,
        firstItemPrice: cards[0]?.price ?? "",
        firstItemDeliveryPrice: cards[0]?.deliveryPrice ?? "",
      },
    },
  };
}

// ── ジャンル/女優/メーカー一覧取得（人気度は簡易近似）────────────
//   DMM の GenreSearch API 自体は件数情報を返さないため、
//   最新カタログから数百件サンプリングして出現頻度を集計し、
//   それを「人気順」の近似として使う。
//   女優・メーカーには公式の一覧APIが別途あるが、ジャンルと
//   同じサンプリングパスで頻度集計できるため、API呼び出し回数を
//   増やさずに3種類まとめて取得する。
//   （いずれも真の総販売数ベースの人気順ではないことに注意）
async function getFanzaFacets(query = {}) {
  const apiId       = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId) {
    return { status: 500, body: { error: "サーバーに API キーが設定されていません。" } };
  }

  const floor = query.floor || FANZA_DEFAULTS.floor;

  // ① floor_id を FloorList から動的解決（ハードコード禁止）
  let floorId = query.floor_id || null;
  if (!floorId) {
    try {
      const floorsResult = await getFanzaFloors();
      const svc = floorsResult.body?.services?.find((s) => s.code === FANZA_DEFAULTS.service);
      const fl  = svc?.floors?.find((f) => f.code === floor);
      floorId = fl?.code || null;
    } catch { /* 解決できなければ genre id 抜きで続行 */ }
  }

  // ② ジャンルの正式一覧（id / name）を取得（女優・メーカーは公式一覧APIを使わず③のサンプルのみで賄う）
  let officialGenres = [];
  if (floorId) {
    const genreParams = new URLSearchParams({
      api_id: apiId, affiliate_id: affiliateId,
      floor_id: floorId, output: "json", hits: "500",
    });
    try {
      const raw  = await fetchUrl(`https://api.dmm.com/affiliate/v3/GenreSearch?${genreParams.toString()}`);
      const data = JSON.parse(raw);
      officialGenres = (data.result?.genre ?? []).map((g) => ({ id: g.genre_id, name: g.name }));
    } catch {
      // GenreSearch が失敗しても後続のサンプリング集計だけで返す
    }
  }

  // ③ 最新カタログを数ページサンプリングしてジャンル・女優・メーカーの出現頻度を集計
  const SAMPLE_PAGES = 4;
  const samplePoints = pickSamplePoints(SAMPLE_PAGES, FANZA_RANDOM_OFFSET_MAX);
  const genreFreq    = new Map();
  const actressFreq  = new Map(); // name -> { count, id }
  const makerFreq    = new Map(); // name -> { count, id }

  await Promise.all(samplePoints.map(async (offset) => {
    try {
      const params = new URLSearchParams({
        api_id: apiId, affiliate_id: affiliateId,
        site: FANZA_DEFAULTS.site, service: FANZA_DEFAULTS.service, floor,
        sort: FANZA_DEFAULTS.sort, hits: "100", offset: String(offset), output: "json",
      });
      const raw  = await fetchUrl(`https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`);
      const data = JSON.parse(raw);
      const items = data.result?.items ?? [];
      for (const item of items) {
        for (const g of item.iteminfo?.genre ?? []) {
          genreFreq.set(g.name, (genreFreq.get(g.name) || 0) + 1);
        }
        for (const a of item.iteminfo?.actress ?? []) {
          const cur = actressFreq.get(a.name) || { count: 0, id: a.id };
          cur.count += 1;
          actressFreq.set(a.name, cur);
        }
        for (const m of item.iteminfo?.maker ?? []) {
          const cur = makerFreq.get(m.name) || { count: 0, id: m.id };
          cur.count += 1;
          makerFreq.set(m.name, cur);
        }
      }
    } catch { /* 1地点の失敗は無視して続行 */ }
  }));

  // ④ ジャンル：出現頻度でマージ。GenreSearchに無い名前もサンプルから拾う
  const genreNameSet = new Set(officialGenres.map((g) => g.name));
  for (const name of genreFreq.keys()) {
    if (!genreNameSet.has(name)) { officialGenres.push({ id: null, name }); genreNameSet.add(name); }
  }
  const genres = officialGenres
    .map((g) => ({ ...g, count: genreFreq.get(g.name) || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));

  // ⑤ 女優・メーカー：サンプルからのみ生成（公式一覧APIは呼ばない）
  const actresses = [...actressFreq.entries()]
    .map(([name, v]) => ({ id: v.id ?? null, name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
  const makers = [...makerFreq.entries()]
    .map(([name, v]) => ({ id: v.id ?? null, name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));

  return {
    status: 200,
    body: {
      genres, actresses, makers,
      approximate: true, // 件数はサンプリング近似であることをクライアントに明示
      sampledFrom: samplePoints.length,
    },
  };
}

// ── フロア一覧 ─────────────────────────────────────────────────
async function getFanzaFloors() {
  const apiId       = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId) {
    return { status: 500, body: { error: "サーバーに API キーが設定されていません。" } };
  }
  const params = new URLSearchParams({ api_id: apiId, affiliate_id: affiliateId, output: "json" });
  const raw    = await fetchUrl(`https://api.dmm.com/affiliate/v3/FloorList?${params.toString()}`);
  const data   = JSON.parse(raw);
  const sites  = data.result?.site ?? [];
  const fanza  = sites.find((s) => s.name === "FANZA" || s.code === "FANZA") || null;
  if (!fanza) return { status: 200, body: { site: "FANZA", services: [] } };
  const services = (fanza.service ?? []).map((svc) => ({
    name: svc.name, code: svc.code,
    floors: (svc.floor ?? []).map((fl) => ({ name: fl.name, code: fl.code })),
  }));
  return { status: 200, body: { site: "FANZA", services } };
}

// ── モックカード生成 ──────────────────────────────────────────
const MOCK_SAMPLE_VIDEOS = [
  "/samples/demo-landscape-01-v2.mp4", "/samples/demo-landscape-02-v2.mp4",
  "/samples/demo-landscape-03-v2.mp4", "/samples/demo-landscape-04-v2.mp4",
  "/samples/demo-landscape-05-v2.mp4", "/samples/demo-portrait-06-v2.mp4",
  "/samples/demo-portrait-07-v2.mp4",  "/samples/demo-portrait-08-v2.mp4",
  "/samples/demo-portrait-09-v2.mp4",  "/samples/demo-portrait-10-v2.mp4",
];
const MOCK_ACTRESSES = [["Mock A","Mock B"],["Mock C"],["Mock D","Mock E"],["Mock F"],["Mock G","Mock H"]];
const MOCK_GENRES    = [["単体作品","スレンダー"],["巨乳","ハイビジョン"],["中出し","美少女"],["企画","素人"],["フェラ","ハイビジョン"]];
const MOCK_MAKERS    = ["Mock Studio A","Mock Studio B","Mock Production C","Mock Films D","Mock Works E"];
const MOCK_SERIES    = ["モックシリーズ Vol.","テストコレクション","サンプル大全集","","Mock Premium"];

function buildMockCards(hits, offset) {
  const cards = [];
  const startIndex = offset - 1;
  for (let i = 0; i < hits; i++) {
    const g          = startIndex + i;
    const paddedNum  = String(g + 1).padStart(3, "0");
    const genreSet   = MOCK_GENRES[g % 5];
    const normalURL  = `https://example.com/mock/mock-${paddedNum}`;
    const affURL     = `${normalURL}?aff=demo`;
    cards.push({
      id: `mock-${paddedNum}`, title: `Mock Sample ${paddedNum} — テスト作品タイトル`,
      videoSrc: MOCK_SAMPLE_VIDEOS[g % 10], sampleType: "video",
      imageUrl: "", normalURL, affiliateURL: affURL,
      outboundURL: resolveOutboundUrl(normalURL, affURL),
      price: String(980 + (g % 5) * 100), deliveryPrice: "", deliveryType: "",
      actresses: MOCK_ACTRESSES[g % 5], genres: genreSet,
      maker: MOCK_MAKERS[g % 5],
      series: MOCK_SERIES[g % 5] ? MOCK_SERIES[g % 5] + (g + 1) : "",
      tags: genreSet.slice(0, 3), sourceType: "fanza_mock",
    });
  }
  return cards;
}

module.exports = { getFanzaSamples, getFanzaFacets, getFanzaFloors, buildMockCards };
