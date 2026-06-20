import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import "./site.css";
import { SAMPLE_WORKS } from "./sampleWorks.js";
import { appConfig, getOutboundUrl } from "./config/appConfig.js";

// ─── ダミーデータ ──────────────────────────────────────────────
const DUMMY_CARDS = [
  { id: "d1", title: "夕暮れの海岸線",        tags: ["風景", "夕日", "海"],           color: "#1a1a2e", accent: "#e94560", emoji: "🌅",  sourceType: "dummy" },
  { id: "d2", title: "都市の夜景タイムラプス",  tags: ["都市", "夜景", "タイムラプス"],  color: "#0f3460", accent: "#533483", emoji: "🌃",  sourceType: "dummy" },
  { id: "d3", title: "森の中の朝霧",           tags: ["自然", "朝", "霧"],             color: "#1b4332", accent: "#40916c", emoji: "🌲",  sourceType: "dummy" },
  { id: "d4", title: "猫の昼寝",              tags: ["動物", "猫", "癒し"],           color: "#3d0c02", accent: "#e85d04", emoji: "🐱",  sourceType: "dummy" },
  { id: "d5", title: "雨の日の窓越し",         tags: ["日常", "雨", "静謐"],           color: "#1c1c2e", accent: "#7b7bff", emoji: "🌧️", sourceType: "dummy" },
  { id: "d6", title: "花火大会ハイライト",      tags: ["花火", "夏祭り", "感動"],       color: "#1a000a", accent: "#ff6b6b", emoji: "🎆",  sourceType: "dummy" },
];

// サンプルカード = 架空デモ作品（横5・縦5の動画付き）
const SAMPLE_CARDS = SAMPLE_WORKS.map((w) => ({
  id:         w.id,
  title:      w.title,
  videoSrc:   w.videoSrc,
  sampleType: w.sampleType,
  tags:       w.genres,
  genres:     w.genres,
  sourceType: "sample",
}));

// ─── localStorage キー ────────────────────────────────────────
const STORAGE_KEY         = "quickpick_v3";
const HISTORY_STORAGE_KEY = "quickpick_history_v3";

// ─── localStorage ヘルパー ────────────────────────────────────
function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        liked:    Array.isArray(parsed.liked)    ? parsed.liked    : [],
        disliked: Array.isArray(parsed.disliked) ? parsed.disliked : [],
      };
    }
  } catch {}
  return { liked: [], disliked: [] };
}

function saveStorage(liked, disliked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ liked, disliked }));
  } catch {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

function toHistoryItem(card, decision) {
  return {
    id:         card.id,
    decision,
    title:      card.title,
    actresses:  card.actresses  || [],
    genres:     card.genres     || [],
    maker:      card.maker      || "",
    series:     card.series     || "",
    sourceType: card.sourceType,
    decidedAt:  new Date().toISOString(),
  };
}

function toStorageItem(card) {
  return {
    id:           card.id,
    title:        card.title,
    tags:         card.tags        ?? [],
    sourceType:   card.sourceType  ?? "dummy",
    actresses:    card.actresses   || [],
    genres:       card.genres      || [],
    maker:        card.maker       || "",
    imageUrl:     card.imageUrl    || "",
    normalURL:    card.normalURL   || card.URL || "",
    outboundURL:  card.outboundURL || card.normalURL || "",
    decidedAt:    new Date().toISOString(),
  };
}

// ─── Object URL 解放 ──────────────────────────────────────────
function revokeLocalCardUrls(cards) {
  for (const card of cards) {
    if (card.sourceType === "local" && card.videoSrc) {
      URL.revokeObjectURL(card.videoSrc);
    }
  }
}

// ─── localStorage 初期値キャッシュ ───────────────────────────
let _storageCache = null;
function _initialStorage() {
  if (!_storageCache) _storageCache = loadStorage();
  return _storageCache;
}

// ─── 重複抑制シャッフル ───────────────────────────────────────
// 判定済みIDのカードを末尾に回す。
// ただし REAPPEAR_RATE の確率でランダムに先頭付近に混入させる
// （YouTubeショート風：完全に消えるわけではない）
const REAPPEAR_RATE = 0.1; // 10%の確率で判定済みカードが前方に残る

function sortBySeenStatus(cards, seenIds) {
  if (seenIds.size === 0) return cards;
  const fresh  = [];
  const seen   = [];
  for (const card of cards) {
    if (seenIds.has(card.id)) {
      if (Math.random() < REAPPEAR_RATE) {
        fresh.push(card);
      } else {
        seen.push(card);
      }
    } else {
      fresh.push(card);
    }
  }
  return [...fresh, ...seen];
}

/**
 * カードから重複排除に使うキーセットを返す。
 * id / videoSrc / normalURL の3軸で重複を検出する。
 */
function getDedupeKeys(card) {
  return [
    card.id        ? `id:${card.id}`      : null,
    card.videoSrc  ? `v:${card.videoSrc}` : null,
    card.normalURL ? `u:${card.normalURL}`: null,
  ].filter(Boolean);
}

/** Fisher-Yates シャッフル */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 2配列に共通要素があるか判定 */
function hasIntersection(a, b) {
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  return b.some((v) => setA.has(v));
}

/** 同じメーカー・シリーズ・女優が連続しにくい並び替え（フロント側・スコア方式） */
function diversityPenalty(card, recent) {
  let score = 0;
  for (let i = 0; i < recent.length; i++) {
    const prev = recent[i];
    const distanceWeight = i + 1;
    if (card.maker  && prev.maker  && card.maker  === prev.maker)  score += 100 * distanceWeight;
    if (card.series && prev.series && card.series === prev.series) score +=  80 * distanceWeight;
    if (hasIntersection(card.actresses || [], prev.actresses || [])) score += 60 * distanceWeight;
    if (hasIntersection(card.genres    || [], prev.genres    || [])) score += 10;
  }
  return score;
}

const FRONT_DIVERSE_LOOKBACK = 6;

function reorderDiverse(cards, recentPrefix) {
  const lb   = FRONT_DIVERSE_LOOKBACK;
  const pool = shuffleArray(cards);
  // recentPrefix: 既存cardsの末尾（追加取得時に連続を防ぐ）
  const result = recentPrefix ? [...recentPrefix] : [];
  const output = [];

  while (pool.length > 0) {
    const recent = result.slice(-lb);
    let bestIndexes = [];
    let bestScore   = Infinity;

    for (let i = 0; i < pool.length; i++) {
      const s = diversityPenalty(pool[i], recent);
      if (s < bestScore)       { bestScore = s; bestIndexes = [i]; }
      else if (s === bestScore) { bestIndexes.push(i); }
    }

    const chosenIndex = bestIndexes[Math.floor(Math.random() * bestIndexes.length)];
    const chosen = pool.splice(chosenIndex, 1)[0];
    result.push(chosen);
    output.push(chosen);
  }

  return output;
}

/**
 * 既存cardsと重複しない新規cardsだけを diverse 化してから末尾に追加する。
 * 既存末尾 FRONT_DIVERSE_LOOKBACK 件を考慮して「交互出現」も防ぐ。
 */
function appendUniqueCards(existingCards, newCards) {
  const seenSet = new Set();
  for (const c of existingCards) {
    for (const k of getDedupeKeys(c)) seenSet.add(k);
  }
  const uniqueNew = newCards.filter((c) => {
    const keys = getDedupeKeys(c);
    if (keys.some((k) => seenSet.has(k))) return false;
    keys.forEach((k) => seenSet.add(k));
    return true;
  });

  // 既存末尾を考慮してdiverse化（交互出現防止）
  const recentPrefix = existingCards.slice(-FRONT_DIVERSE_LOOKBACK);
  const diversified  = reorderDiverse(uniqueNew, recentPrefix);

  return [...existingCards, ...diversified];
}

// ─── CardContent ─────────────────────────────────────────────
function CardContent({ card, index, total, likeOpacity, nopeOpacity, videoRef }) {
  const isIframe = card.sampleType === "iframe" && card.videoSrc;

  // 開発用デバッグ（sampleTypeと描画経路の確認）
  if (process.env.NODE_ENV !== "production") {
    console.debug("[card]", {
      id:         card.id,
      sampleType: card.sampleType,
      videoSrc:   card.videoSrc,
      hasImageUrl: !!card.imageUrl,
    });
  }

  const renderMedia = () => {
    if (card.sampleType === "video" && card.videoSrc) {
      return (
        <video
          ref={videoRef}
          src={card.videoSrc}
          controls
          playsInline
          preload="metadata"
          className="card-video"
          onClick={(e) => e.stopPropagation()}
        />
      );
    }

    if (isIframe) {
      // iframeは外側から制御しない。ユーザーがプレイヤーを直接操作できることが必須。
      // 透明レイヤーは一切置かない。pointer-events: auto でクリックを通す。
      //
      // scrolling="no"  : 通常これで問題ないが、操作UIが切れる場合は "auto" を試す
      // scrolling="auto": 内側スクロールが出るが、操作UIが見えやすくなる場合がある
      return (
        <iframe
          key={card.id}
          src={card.videoSrc}
          className="card-iframe"
          scrolling="no"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title={card.title}
          ref={(el) => {
            // 開発用デバッグ: mediaエリアの実高さを確認
            if (el && process.env.NODE_ENV !== "production") {
              const mediaEl = el.parentElement;
              console.log("[iframe]", {
                id:          card.id,
                sampleType:  card.sampleType,
                videoSrc:    card.videoSrc,
                mediaHeight: mediaEl?.clientHeight,
                iframeHeight: el.clientHeight,
              });
            }
          }}
        />
      );
    }

    // video も iframe もない場合のfallback（ダミーカード・imageUrlあり）
    return (
      <div
        className="card-thumbnail"
        style={{ background: `linear-gradient(135deg, ${card.color || "#1a1a2e"} 0%, ${card.accent || "#e94560"} 100%)` }}
      >
        {card.imageUrl
          ? <img src={card.imageUrl} alt={card.title} className="card-thumb-img" />
          : <span className="card-emoji">{card.emoji || "🎬"}</span>
        }
      </div>
    );
  };

  const outbound = getOutboundUrl(card);

  return (
    <>
      <div className="stamp stamp-like" style={{ opacity: likeOpacity }}>LIKE ♥</div>
      <div className="stamp stamp-nope" style={{ opacity: nopeOpacity }}>NOPE ✕</div>

      <div className={isIframe ? "card-media card-media--iframe" : "card-media"}>
        {renderMedia()}
      </div>

      {/* iframe操作時のヒント */}
      {isIframe && (
        <p className="iframe-hint">動画操作後はカード外をクリックするとキー操作に戻ります</p>
      )}

      <div className="card-body">
        <div className="card-counter">{index + 1} / {total}</div>
        <h2 className="card-title">{card.title}</h2>
        {card.sourceType === "fanza" || card.sourceType === "fanza_mock" ? (
          <div className="card-meta">
            {card.actresses?.length > 0 && (
              <p className="card-meta-row">
                <span className="meta-label">出演</span>
                <span className="meta-value">{card.actresses.slice(0, 3).join(" / ")}</span>
              </p>
            )}
            {card.maker && (
              <p className="card-meta-row">
                <span className="meta-label">メーカー</span>
                <span className="meta-value">{card.maker}</span>
              </p>
            )}
            {card.price && (
              <p className="card-meta-row">
                <span className="meta-label">価格</span>
                <span className="meta-value">{card.price}{/^\d+$/.test(String(card.price)) ? "円" : ""}</span>
              </p>
            )}
          </div>
        ) : null}
        <div className="card-tags">
          {(card.tags || []).slice(0, 4).map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        {/* 詳細リンク（必ず outboundURL を使用・購入煽り文言は使わない）*/}
        {outbound && (
          <a
            href={outbound}
            target="_blank"
            rel="noopener noreferrer"
            className="card-detail-link"
            onClick={(e) => e.stopPropagation()}
          >
            詳細を見る →
          </a>
        )}
      </div>
    </>
  );
}

// ─── VideoCard ────────────────────────────────────────────────
function VideoCard({ card, index, total, isBack, isEntering, videoRef, dragState, onDragStart, onDragMove, onDragEnd }) {
  const startRef   = useRef(null);
  const isDragging = useRef(false);

  const dx          = dragState?.dx ?? 0;
  const dy          = dragState?.dy ?? 0;
  const rotation    = dx * 0.06;
  const opacity     = dragState ? Math.max(0.4, 1 - Math.abs(dx) / 500) : 1;
  const likeOpacity = dragState ? Math.max(0, dx  / 120) : 0;
  const nopeOpacity = dragState ? Math.max(0, -dx / 120) : 0;

  const frontStyle = {
    transform:  dragState ? `translate(${dx}px, ${dy * 0.3}px) rotate(${rotation}deg)` : "",
    opacity,
    transition: dragState ? "none" : "transform 0.35s cubic-bezier(.22,1,.36,1), opacity 0.35s",
  };

  const handlePointerDown = (e) => {
    if (isBack) return;
    isDragging.current = true;
    const pt = e.touches ? e.touches[0] : e;
    startRef.current = { x: pt.clientX, y: pt.clientY };
    onDragStart();
  };
  const handlePointerMove = (e) => {
    if (isBack || !isDragging.current || !startRef.current) return;
    const pt = e.touches ? e.touches[0] : e;
    onDragMove(pt.clientX - startRef.current.x, pt.clientY - startRef.current.y);
  };
  const handlePointerUp = () => {
    if (isBack || !isDragging.current) return;
    isDragging.current = false;
    startRef.current   = null;
    onDragEnd();
  };

  if (isBack) {
    return (
      <div className="card card--back" aria-hidden="true">
        <CardContent card={card} index={index} total={total} likeOpacity={0} nopeOpacity={0} videoRef={null} />
      </div>
    );
  }

  return (
    <div
      className={isEntering ? "card card--front-enter" : "card"}
      style={frontStyle}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
    >
      <CardContent card={card} index={index} total={total} likeOpacity={likeOpacity} nopeOpacity={nopeOpacity} videoRef={videoRef} />
    </div>
  );
}

// ─── 好き一覧ページ ───────────────────────────────────────────
function LikedPage({ liked, onClear }) {
  if (liked.length === 0) {
    return (
      <div className="liked-empty">
        <p className="liked-empty-icon">♥</p>
        <p className="liked-empty-text">まだ好きな作品がありません</p>
        <p className="liked-empty-sub">フィードで気になった作品を♥してみましょう</p>
      </div>
    );
  }

  return (
    <div className="liked-page">
      <div className="liked-header">
        <span className="liked-count">♥ {liked.length} 件</span>
        <button className="btn-clear" onClick={onClear}>クリア</button>
      </div>
      <div className="liked-grid">
        {[...liked].reverse().map((card) => (
          <div key={card.id} className="liked-card">
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={card.title} className="liked-card-img" />
            ) : (
              <div className="liked-card-thumb">🎬</div>
            )}
            <div className="liked-card-info">
              <p className="liked-card-title">{card.title}</p>
              {card.actresses?.length > 0 && (
                <p className="liked-card-actresses">{card.actresses.slice(0, 2).join(" / ")}</p>
              )}
              <div className="liked-card-tags">
                {(card.genres || card.tags || []).slice(0, 3).map((t) => (
                  <span key={t} className="tag tag--sm">{t}</span>
                ))}
              </div>
              {getOutboundUrl(card) && (
                <a
                  href={getOutboundUrl(card)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liked-card-link"
                >
                  作品ページを見る（通常リンク）→
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── メインアプリ ─────────────────────────────────────────────
export default function SwipeApp({ onNavigate }) {
  const [activeTab, setActiveTab]       = useState("feed"); // "feed" | "liked"
  const [showDevTools, setShowDevTools] = useState(false);  // 開発用ボタン折りたたみ
  const [cards, setCards]               = useState(SAMPLE_CARDS); // 初期表示はデモ動画
  const [current, setCurrent]           = useState(0);
  const [liked, setLiked]               = useState(() => _initialStorage().liked);
  const [disliked, setDisliked]         = useState(() => _initialStorage().disliked);
  const [decisionHistory, setDecisionHistory] = useState(() => loadHistory());
  const [dragState, setDragState]       = useState(null);
  const [exitDir, setExitDir]           = useState(null);
  const [isEntering, setIsEntering]     = useState(false);
  const [isAnimating, setIsAnimating]   = useState(false);

  const [isFetchingFanza, setIsFetchingFanza] = useState(false);
  const [isFetchingMore, setIsFetchingMore]   = useState(false);
  const [fanzaError, setFanzaError]           = useState(null);
  const [fanzaQuery, setFanzaQuery]           = useState(null); // 取得元カテゴリ表示用
  const fanzaOffsetRef = useRef(1);
  const fanzaHits      = 20;

  const fileInputRef   = useRef(null);
  const cardsRef       = useRef(cards);
  const isAnimatingRef = useRef(false);
  const videoRef       = useRef(null);

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { return () => { revokeLocalCardUrls(cardsRef.current); }; }, []); // eslint-disable-line
  useEffect(() => { saveStorage(liked, disliked); }, [liked, disliked]);
  useEffect(() => { saveHistory(decisionHistory); }, [decisionHistory]);

  const currentCard = cards[current];
  const nextCard    = cards[current + 1] ?? null;
  const finished    = current >= cards.length;

  // 判定済み ID セット（重複抑制に使用）
  const seenIdsRef = useRef(new Set(decisionHistory.map((h) => h.id)));
  useEffect(() => {
    seenIdsRef.current = new Set(decisionHistory.map((h) => h.id));
  }, [decisionHistory]);

  // ─── FANZA API 取得 ──────────────────────────────────────────
  /**
   * FANZA APIからカードを取得する。
   * 初回は random=true（サーバー側でoffsetをランダム化）。
   * 追加取得は random=false&offset=N で確実に進める。
   */
  async function fetchFanzaCards({ offset = 1, random = false } = {}) {
    const params = new URLSearchParams({ hits: String(fanzaHits) });
    if (random) {
      params.set("random", "true");
    } else {
      params.set("random", "false");
      params.set("offset", String(offset));
    }
    console.log(`[fanza] fetch offset=${offset} random=${random}`);
    const res = await fetch(`${appConfig.apiBase}/fanza-samples?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  const handleLoadFanza = async () => {
    if (isFetchingFanza) return;
    setIsFetchingFanza(true);
    setFanzaError(null);
    try {
      revokeLocalCardUrls(cardsRef.current);
      // 初回はランダムoffset（毎回違う位置から取得）
      const data = await fetchFanzaCards({ random: true });

      // サーバーが返した nextOffset を次回の追加取得に使う
      fanzaOffsetRef.current = data.debug?.nextOffset || (data.offset ?? 1) + fanzaHits;

      if (data.query) {
        console.log("[fanza] 取得元:", `${data.query.site} / ${data.query.service} / ${data.query.floor} offset=${data.debug?.offsetUsed}`, data.query);
        setFanzaQuery(data.query);
      }
      if (data.debug) {
        console.log("[fanza] debug:", data.debug);
      }

      const sorted = sortBySeenStatus(data.cards, seenIdsRef.current);
      setCards(sorted);
      setCurrent(0);
      setLiked([]);
      setDisliked([]);
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setExitDir(null);
      setDragState(null);
      setActiveTab("feed");
    } catch (err) {
      console.error("[fanza] fetch error:", err);
      setFanzaError("FANZAサンプルを取得できませんでした。API ID、アフィリエイトID、通信状態を確認してください。");
    } finally {
      setIsFetchingFanza(false);
    }
  };

  const fetchMoreFanza = useCallback(async () => {
    if (isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const currentOffset = fanzaOffsetRef.current;
      const data = await fetchFanzaCards({ offset: currentOffset, random: false });

      // nextOffset をサーバーから受け取るか、自前で計算
      fanzaOffsetRef.current = data.debug?.nextOffset || (currentOffset + fanzaHits);

      if (data.debug) {
        console.log(`[fanza] fetchMore debug:`, data.debug);
      }

      setCards((prev) => {
        const appended = appendUniqueCards(prev, data.cards);
        const added    = appended.length - prev.length;
        console.log(`[fanza] +${added} unique cards appended (offset=${currentOffset})`);
        return appended;
      });
    } catch (err) {
      console.error("[fanza] fetchMore error:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore]); // eslint-disable-line

  useEffect(() => {
    const remaining = cards.length - current;
    const isFanza   = cards[0]?.sourceType === "fanza" || cards[0]?.sourceType === "fanza_mock";
    if (isFanza && remaining <= 5 && remaining > 0 && !isFetchingMore && !isFetchingFanza) {
      fetchMoreFanza();
    }
  }, [current, cards.length]); // eslint-disable-line

  // ─── 次カード自動再生 ─────────────────────────────────────
  useEffect(() => {
    if (finished) return;
    const card = cards[current];
    if (card?.sampleType !== "video" || !card?.videoSrc) return;
    const timer = setTimeout(() => {
      videoRef.current?.play().catch((err) => console.warn("autoplay blocked:", err));
    }, 460);
    return () => clearTimeout(timer);
  }, [current]); // eslint-disable-line

  // ─── スワイプ確定 ─────────────────────────────────────────
  const doDecide = useCallback((dir) => {
    if (isAnimatingRef.current || current >= cards.length) return;
    const video = videoRef.current;
    if (video) { try { video.pause(); video.currentTime = 0; } catch {} }

    isAnimatingRef.current = true;
    setIsAnimating(true);
    setExitDir(dir);

    setTimeout(() => {
      const card      = cards[current];
      const storeItem = toStorageItem(card);
      const histItem  = toHistoryItem(card, dir === "right" ? "like" : "dislike");

      if (dir === "right") {
        setLiked((prev) => [...prev, storeItem]);
      } else {
        setDisliked((prev) => [...prev, storeItem]);
      }
      setDecisionHistory((prev) => [...prev, histItem]);
      console.log(`[${appConfig.appName}] decision logged:`, JSON.stringify(histItem, null, 2));

      setExitDir(null);
      setDragState(null);
      setCurrent((prev) => prev + 1);

      requestAnimationFrame(() => {
        setIsEntering(true);
        setTimeout(() => {
          setIsEntering(false);
          isAnimatingRef.current = false;
          setIsAnimating(false);
        }, 440);
      });
    }, 360);
  }, [cards, current]);

  // ─── キーボード操作 ───────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeTab !== "feed") return; // 好き一覧タブ中は無効
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || tag === "video") return;
      if (isAnimatingRef.current || finished) return;
      switch (e.key) {
        case "ArrowRight": case "d": case "D": e.preventDefault(); doDecide("right"); break;
        case "ArrowLeft":  case "a": case "A": e.preventDefault(); doDecide("left");  break;
        default: break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doDecide, finished, activeTab]);

  // ─── ドラッグ ─────────────────────────────────────────────
  const handleDragStart = useCallback(() => {
    if (!isAnimatingRef.current) setDragState({ dx: 0, dy: 0 });
  }, []);
  const handleDragMove = useCallback((dx, dy) => {
    if (!isAnimatingRef.current) setDragState({ dx, dy });
  }, []);
  const handleDragEnd = useCallback(() => {
    setDragState((prev) => {
      if (!prev) return null;
      if (Math.abs(prev.dx) > 90) {
        const dir = prev.dx > 0 ? "right" : "left";
        setTimeout(() => doDecide(dir), 0);
        return prev;
      }
      return null;
    });
  }, [doDecide]);

  // ─── ファイル選択 ─────────────────────────────────────────
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    revokeLocalCardUrls(cardsRef.current);
    const newCards = files.map((file, i) => ({
      id:         `file-${Date.now()}-${i}`,
      title:      file.name.replace(/\.[^.]+$/, ""),
      tags:       [file.type.split("/")[1] || "video"],
      videoSrc:   URL.createObjectURL(file),
      sampleType: "video",
      sourceType: "local",
      color:      "#1a1a2e",
      accent:     "#e94560",
      emoji:      "🎬",
    }));
    setCards(newCards);
    setCurrent(0);
    setLiked([]);
    setDisliked([]);
    setFanzaError(null);
    isAnimatingRef.current = false;
    setIsAnimating(false);
    setExitDir(null);
    setDragState(null);
    setActiveTab("feed");
    e.target.value = "";
  };

  const handleLoadSamples = () => {
    revokeLocalCardUrls(cardsRef.current);
    setCards(SAMPLE_CARDS);
    setCurrent(0);
    setLiked([]);
    setDisliked([]);
    setFanzaError(null);
    isAnimatingRef.current = false;
    setIsAnimating(false);
    setExitDir(null);
    setDragState(null);
    setActiveTab("feed");
  };

  const handleReset = () => {
    revokeLocalCardUrls(cardsRef.current);
    setCards(SAMPLE_CARDS); // リセット後もデモ動画に戻す
    setCurrent(0);
    setLiked([]);
    setDisliked([]);
    setFanzaError(null);
    isAnimatingRef.current = false;
    setIsAnimating(false);
    setExitDir(null);
    setDragState(null);
  };

  const handleClearLiked = () => {
    if (window.confirm(`好き ${liked.length} 件をクリアしますか？`)) {
      setLiked([]);
    }
  };

  const frontSlotClass = [
    "card-slot", "card-slot--front",
    exitDir === "right" ? "exit-right" : "",
    exitDir === "left"  ? "exit-left"  : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="app">
      {/* ── ヘッダー ─────────────────────────────────────── */}
      <header className="header">
        <button className="header-logo header-logo--btn" onClick={() => onNavigate && onNavigate("home")}>
          ⚡ {appConfig.appName}
        </button>
        {/* タブナビ */}
        <nav className="tab-nav">
          <button
            className={`tab-btn ${activeTab === "feed" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("feed")}
          >
            フィード
          </button>
          <button
            className={`tab-btn ${activeTab === "liked" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("liked")}
          >
            好き {liked.length > 0 && <span className="tab-badge">{liked.length}</span>}
          </button>
        </nav>
      </header>

      {/* ── 審査担当者向け説明バナー ─────────────────────── */}
      <div className="demo-notice">
        この画面は、作品を1つずつ確認しながら、好き・興味なしを直感的に選べるデモ画面です。
        現在は審査用のダミーデータを表示しています。正式版では、提携サービスから許可された作品情報を利用する予定です。
      </div>

      {/* ════════════════════════════════════
          フィードタブ
      ════════════════════════════════════ */}
      {activeTab === "feed" && (
        <>
          {/* ── 開発用ボタン（折りたたみ）────────────────────
               本番デプロイ時はこのブロックごと削除する
          ─────────────────────────────────────────────── */}
          <div className="dev-tools">
            <button
              className="dev-tools-toggle"
              onClick={() => setShowDevTools((v) => !v)}
              aria-expanded={showDevTools}
            >
              {showDevTools ? "▲ 開発メニューを閉じる" : "▼ 開発メニュー"}
            </button>
            {showDevTools && (
              <div className="file-row">
                <button className="btn-fanza" onClick={handleLoadFanza} disabled={isAnimating || isFetchingFanza}>
                  {isFetchingFanza ? "読み込み中…" : "🔞 FANZAサンプル"}
                </button>
                <button className="btn-sample" onClick={handleLoadSamples} disabled={isAnimating || isFetchingFanza}>
                  🎬 サンプル
                </button>
                <button className="btn-file" onClick={() => fileInputRef.current.click()} disabled={isAnimating || isFetchingFanza}>
                  📂 ファイル
                </button>
                <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: "none" }} onChange={handleFileChange} />
                {fanzaQuery && (
                  <p className="dev-source">
                    取得元: {fanzaQuery.site} / {fanzaQuery.service} / {fanzaQuery.floor}（{fanzaQuery.sort}）
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── エラーバナー ─────────────────────────── */}
          {fanzaError && (
            <div className="error-banner" role="alert">
              <span className="error-icon">⚠️</span>
              <span>{fanzaError}</span>
              <button className="error-close" onClick={() => setFanzaError(null)}>✕</button>
            </div>
          )}

          {/* ── 追加取得中 ───────────────────────────── */}
          {isFetchingMore && <p className="fetching-more">次のサンプルを読み込んでいます…</p>}

          {/* ── カードエリア ─────────────────────────── */}
          <main className="stage">
            {finished ? (
              <div className="finished">
                <div className="finished-icon">🎉</div>
                <p className="finished-text">すべて見終わりました</p>
                <p className="finished-sub">♥ {liked.length} 件 好き　／　✕ {disliked.length} 件 嫌い</p>
                <button className="btn-reset" onClick={handleReset}>最初からやり直す</button>
              </div>
            ) : (
              <div className="card-stack">
                {nextCard && (
                  <div className="card-slot card-slot--back">
                    <VideoCard
                      key={`back-${nextCard.id}`}
                      card={nextCard} index={current + 1} total={cards.length}
                      isBack={true} isEntering={false} videoRef={null}
                    />
                  </div>
                )}
                <div className={frontSlotClass}>
                  <VideoCard
                    key={`front-${currentCard.id}`}
                    card={currentCard} index={current} total={cards.length}
                    isBack={false} isEntering={isEntering} videoRef={videoRef}
                    dragState={dragState}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              </div>
            )}
          </main>

          {/* ── アクションボタン ─────────────────────── */}
          {!finished && (
            <div className="actions">
              <button className="btn btn-nope" onClick={() => doDecide("left")} disabled={isAnimating}>
                <span>✕</span><small>嫌い</small>
              </button>
              <button className="btn btn-like" onClick={() => doDecide("right")} disabled={isAnimating}>
                <span>♥</span><small>好き</small>
              </button>
            </div>
          )}

          {/* ── キーボードヒント ─────────────────────── */}
          {!finished && (
            <p className="key-hint">
              <kbd>A</kbd> 嫌い　<kbd>D</kbd> 好き　／　<kbd>←</kbd> 嫌い　<kbd>→</kbd> 好き
            </p>
          )}
        </>
      )}

      {/* ════════════════════════════════════
          好き一覧タブ
      ════════════════════════════════════ */}
      {activeTab === "liked" && (
        <LikedPage liked={liked} onClear={handleClearLiked} />
      )}

      {/* サイトトップへ戻る導線 */}
      <div className="swipe-back-row">
        <button className="link-back" onClick={() => onNavigate && onNavigate("home")}>
          ← {appConfig.appName}トップへ戻る
        </button>
      </div>
    </div>
  );
}
