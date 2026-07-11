import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import "./site.css";
import { appConfig, getOutboundUrl } from "./config/appConfig.js";

const isDev = import.meta.env.DEV;
const log = (...args) => { if (isDev) console.log(...args); };

// ─── localStorage キー ────────────────────────────────────────
const STORAGE_KEY         = "eropick_v3";
const HISTORY_STORAGE_KEY = "eropick_history_v3";
const OLD_STORAGE_KEY         = "quickpick_v3";
const OLD_HISTORY_STORAGE_KEY = "quickpick_history_v3";
const TAG_WEIGHTS_KEY         = "eropick_tagweights_v1"; // タグ重み（好み学習）

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { liked: Array.isArray(parsed.liked) ? parsed.liked : [] };
    }
  } catch {}
  return { liked: [] };
}
function saveStorage(liked) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ liked })); } catch {}
}
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY) || localStorage.getItem(OLD_HISTORY_STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  } catch {}
  return [];
}
function saveHistory(history) {
  try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history)); } catch {}
}
function toStorageItem(card) {
  return {
    id: card.id, title: card.title,
    tags: card.tags ?? [], sourceType: card.sourceType ?? "fanza",
    actresses: card.actresses || [], genres: card.genres || [],
    maker: card.maker || "", imageUrl: card.imageUrl || "",
    normalURL: card.normalURL || "",
    outboundURL: card.outboundURL || card.normalURL || "",
    decidedAt: new Date().toISOString(),
  };
}
function revokeLocalCardUrls(cards) {
  for (const card of cards) {
    if (card.sourceType === "local" && card.videoSrc) URL.revokeObjectURL(card.videoSrc);
  }
}
let _storageCache = null;
function _initialStorage() {
  if (!_storageCache) _storageCache = loadStorage();
  return _storageCache;
}

// ─── タグ重み（好み学習） ──────────────────────────────────────
function loadTagWeights() {
  try {
    const raw = localStorage.getItem(TAG_WEIGHTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** カードのタグスコアを計算（ジャンル + 出演者） */
function scoreItem(card, weights) {
  return [...(card.genres ?? []), ...(card.actresses ?? [])]
    .reduce((s, t) => s + (weights[t] ?? 0), 0);
}

// ─── 重複排除・並び替え ────────────────────────────────────────
function getDedupeKeys(card) {
  return [
    card.id        ? `id:${card.id}`       : null,
    card.videoSrc  ? `v:${card.videoSrc}`  : null,
    card.normalURL ? `u:${card.normalURL}` : null,
  ].filter(Boolean);
}
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function hasIntersection(a, b) {
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  return b.some((v) => setA.has(v));
}
function reorderDiverse(cards) {
  const pool = shuffleArray(cards);
  const result = [];
  while (pool.length > 0) {
    const prev = result[result.length - 1];
    let index = 0;
    if (prev) {
      const pi = pool.findIndex((c) => {
        return !(prev.maker  && c.maker  && prev.maker  === c.maker) &&
               !(prev.series && c.series && prev.series === c.series) &&
               !hasIntersection(prev.actresses || [], c.actresses || []);
      });
      if (pi >= 0) index = pi;
    }
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}
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
  return [...existingCards, ...reorderDiverse(uniqueNew)];
}
function sortBySeenStatus(cards, seenIds) {
  if (seenIds.size === 0) return cards;
  const fresh = [], seen = [];
  for (const card of cards) {
    (seenIds.has(card.id) && Math.random() > 0.1 ? seen : fresh).push(card);
  }
  return [...fresh, ...seen];
}

// ─── 好き一覧ページ ────────────────────────────────────────────
function LikedPage({ liked, onClear, onRemove }) {
  if (liked.length === 0) {
    return (
      <div className="liked-empty">
        <p className="liked-empty-icon">♥</p>
        <p className="liked-empty-text">まだいいねした作品がありません</p>
        <p className="liked-empty-sub">気になった作品をダブルタップか♥で保存しましょう</p>
      </div>
    );
  }
  return (
    <div className="liked-page">
      <div className="liked-header">
        <span className="liked-count">♥ {liked.length} 件</span>
        <button className="btn-clear" onClick={onClear}>すべてクリア</button>
      </div>
      <div className="liked-grid">
        {[...liked].reverse().map((card) => {
          const outbound = getOutboundUrl(card);
          return (
            <div key={card.id} className="liked-card">
              {card.imageUrl
                ? <img src={card.imageUrl} alt={card.title} className="liked-card-img" />
                : <div className="liked-card-thumb">🎬</div>
              }
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
                <div className="liked-card-footer">
                  {outbound && (
                    <a href={outbound} target="_blank" rel="noopener noreferrer" className="liked-card-link">
                      詳細を見る →
                    </a>
                  )}
                  <button
                    className="liked-card-remove"
                    onClick={() => onRemove(card.id)}
                    aria-label="削除"
                  >✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CardContent ──────────────────────────────────────────────
function CardContent({ card, isLiked, likeFlash, onLike, videoRef }) {
  const isIframe = card.sampleType === "iframe" && card.videoSrc;
  const outbound = getOutboundUrl(card);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const handlePlayPause = (e) => {
    e.stopPropagation();
    const vid = videoRef?.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); } else { vid.pause(); }
  };

  const renderMedia = () => {
    if (card.sampleType === "video" && card.videoSrc) {
      return (
        <div className="video-wrapper">
          <video
            ref={videoRef}
            src={card.videoSrc}
            controls
            playsInline
            preload="metadata"
            className="card-video"
            onPlay={() => setIsVideoPlaying(true)}
            onPause={() => setIsVideoPlaying(false)}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className={`btn-play-pause ${isVideoPlaying ? "btn-play-pause--playing" : ""}`}
            onClick={handlePlayPause}
            aria-label={isVideoPlaying ? "停止" : "再生"}
          >
            {isVideoPlaying ? "⏸" : "▶"}
          </button>
        </div>
      );
    }
    if (isIframe) {
      return (
        <iframe
          key={card.id}
          src={card.videoSrc}
          className="card-iframe"
          scrolling="no"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title={card.title}
        />
      );
    }
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

  return (
    <div className={`card-inner${isIframe ? " card-inner--iframe" : ""}`}>
      {likeFlash && (
        <div className="like-flash">♥</div>
      )}

      {/* Layer 1: メディア */}
      <div className={isIframe ? "card-media card-media--iframe" : "card-media"}>
        {renderMedia()}
      </div>

      {/* Layer 2: テキスト情報 */}
      <div className="card-overlay">
        <div className="card-body">
          <h2 className="card-title">{card.title}</h2>
          {(card.sourceType === "fanza" || card.sourceType === "fanza_mock") && (
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
            </div>
          )}
          <div className="card-tags">
            {(card.tags || []).slice(0, 3).map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
          {outbound && (
            <a href={outbound} target="_blank" rel="noopener noreferrer"
               className="card-detail-link" onClick={(e) => e.stopPropagation()}>
              詳細を見る →
            </a>
          )}
        </div>
      </div>

      {/* Layer 3: ♥ボタンのみ */}
      <div className="card-actions" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className={`btn-heart ${isLiked ? "btn-heart--active" : ""}`}
          onClick={(e) => { e.stopPropagation(); onLike(); }}
          aria-label="保存"
        >♥</button>
      </div>
    </div>
  );
}

// ─── メインアプリ ─────────────────────────────────────────────
export default function SwipeApp({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("feed");
  const [cards, setCards]         = useState([]);
  const [current, setCurrent]     = useState(0);
  const [liked, setLiked]         = useState(() => _initialStorage().liked);
  const [tagWeights, setTagWeights] = useState(() => loadTagWeights()); // 好みタグ重み
  const [likeFlashId, setLikeFlashId] = useState(null); // ダブルタップ演出用
  const [swipeDir, setSwipeDir]   = useState(null); // "up" | "down"
  const [isAnimating, setIsAnimating] = useState(false);

  const [isFetchingFanza, setIsFetchingFanza] = useState(false);
  const [isFetchingMore, setIsFetchingMore]   = useState(false);
  const [fanzaError, setFanzaError]           = useState(null);
  const fanzaOffsetRef  = useRef(1);
  const fanzaHits       = 20;
  const hasAutoLoaded   = useRef(false);

  const cardsRef        = useRef(cards);
  const isAnimatingRef  = useRef(false);
  const videoRef        = useRef(null);
  const tagWeightsRef   = useRef(tagWeights); // fetchMore 内で最新値を参照
  // ダブルタップ検出用
  const lastTapRef      = useRef(0);
  // ドラッグ用
  const dragStartRef    = useRef(null);
  const dragCurrentRef  = useRef(null);
  const isDraggingRef   = useRef(false);
  const wheelCooldown   = useRef(false);   // ホイール連続発火防止

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { return () => { revokeLocalCardUrls(cardsRef.current); }; }, []); // eslint-disable-line
  useEffect(() => { saveStorage(liked); }, [liked]);
  useEffect(() => {
    tagWeightsRef.current = tagWeights;
    try { localStorage.setItem(TAG_WEIGHTS_KEY, JSON.stringify(tagWeights)); } catch {}
  }, [tagWeights]);

  // 表示中の履歴（decisionHistoryの代わり - seenIds管理用）
  const seenIdsRef = useRef(new Set(liked.map((c) => c.id)));
  useEffect(() => {
    seenIdsRef.current = new Set(liked.map((c) => c.id));
  }, [liked]);

  const currentCard  = cards[current];
  const isAtEnd      = current >= cards.length && cards.length > 0;
  const isAtStart    = current === 0;

  // ─── 年齢確認後に自動取得 ────────────────────────────────────
  useEffect(() => {
    if (!hasAutoLoaded.current && !isFetchingFanza) {
      hasAutoLoaded.current = true;
      handleLoadFanza();
    }
  }, []); // eslint-disable-line

  // ─── FANZA API 取得 ──────────────────────────────────────────
  async function fetchFanzaCards({ offset = 1, random = false } = {}) {
    const params = new URLSearchParams({ hits: String(fanzaHits) });
    if (random) { params.set("random", "true"); }
    else { params.set("random", "false"); params.set("offset", String(offset)); }
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
      const data = await fetchFanzaCards({ random: true });
      fanzaOffsetRef.current = data.debug?.nextOffset || (data.offset ?? 1) + fanzaHits;
      if (isDev && data.debug) log("[fanza] debug:", data.debug);
      const weightSorted = [...data.cards].sort(
        (a, b) => scoreItem(b, tagWeightsRef.current) - scoreItem(a, tagWeightsRef.current)
      );
      const sorted = sortBySeenStatus(weightSorted, seenIdsRef.current);
      setCards(sorted);
      setCurrent(0);
      setSwipeDir(null);
      setActiveTab("feed");
    } catch (err) {
      log("[fanza] error:", err.message);
      setFanzaError("動画を取得できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsFetchingFanza(false);
    }
  };

  const fetchMoreFanza = useCallback(async () => {
    if (isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const offset = fanzaOffsetRef.current;
      const data   = await fetchFanzaCards({ offset, random: false });
      fanzaOffsetRef.current = data.debug?.nextOffset || (offset + fanzaHits);
      const weightSorted = [...data.cards].sort(
        (a, b) => scoreItem(b, tagWeightsRef.current) - scoreItem(a, tagWeightsRef.current)
      );
      setCards((prev) => appendUniqueCards(prev, weightSorted));
    } catch (err) {
      log("[fanza] fetchMore error:", err.message);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore]); // eslint-disable-line

  // 残り5件以下で追加取得
  useEffect(() => {
    const remaining = cards.length - current;
    const isFanza = cards[0]?.sourceType === "fanza" || cards[0]?.sourceType === "fanza_mock";
    if (isFanza && remaining <= 5 && remaining > 0 && !isFetchingMore && !isFetchingFanza) {
      fetchMoreFanza();
    }
  }, [current, cards.length]); // eslint-disable-line

  // ─── 次へ / 前へ ─────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (isAnimatingRef.current) return;
    if (current >= cards.length - 1 && !isFetchingMore) return;
    const video = videoRef.current;
    if (video) { try { video.pause(); video.currentTime = 0; } catch {} }
    isAnimatingRef.current = true;
    setIsAnimating(true);
    setSwipeDir("up");
    setTimeout(() => {
      setCurrent((prev) => prev + 1);
      setSwipeDir(null);
      requestAnimationFrame(() => {
        isAnimatingRef.current = false;
        setIsAnimating(false);
      });
    }, 300);
  }, [cards.length, current, isFetchingMore]);

  const goPrev = useCallback(() => {
    if (isAnimatingRef.current || current === 0) return;
    const video = videoRef.current;
    if (video) { try { video.pause(); video.currentTime = 0; } catch {} }
    isAnimatingRef.current = true;
    setIsAnimating(true);
    setSwipeDir("down");
    setTimeout(() => {
      setCurrent((prev) => prev - 1);
      setSwipeDir(null);
      requestAnimationFrame(() => {
        isAnimatingRef.current = false;
        setIsAnimating(false);
      });
    }, 300);
  }, [current]);

  // ─── タグ重み更新（好み学習）─────────────────────────────────
  const applyTagDelta = useCallback((card, delta) => {
    const tags = [...(card.genres ?? []), ...(card.actresses ?? [])];
    if (tags.length === 0) return;
    setTagWeights((prev) => {
      const next = { ...prev };
      tags.forEach((t) => { next[t] = (next[t] ?? 0) + delta; });
      return next;
    });
  }, []);

  // ─── いいね（トグル方式）──────────────────────────────────────
  const handleLike = useCallback((card) => {
    if (!card) return;
    const isCurrentlyLiked = seenIdsRef.current.has(card.id);

    if (isCurrentlyLiked) {
      // 取り消し：削除 + タグ -1（アニメなし）
      setLiked((prev) => prev.filter((c) => c.id !== card.id));
      applyTagDelta(card, -1);
    } else {
      // いいね：追加 + タグ +1 + フラッシュ演出
      setLikeFlashId(card.id);
      setTimeout(() => setLikeFlashId(null), 600);
      setLiked((prev) => {
        if (prev.some((c) => c.id === card.id)) return prev;
        return [...prev, toStorageItem(card)];
      });
      applyTagDelta(card, 1);
    }
  }, [applyTagDelta]);

  const handleDoubleTap = useCallback((card) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleLike(card);
    }
    lastTapRef.current = now;
  }, [handleLike]);

  // ─── キーボード + マウスホイール ─────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (activeTab !== "feed") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (["input","textarea","select","video"].includes(tag)) return;
      switch (e.key) {
        // ArrowDown / S = 次へ（ホイール下と同じ方向に統一）
        case "ArrowDown": case "s": case "S": e.preventDefault(); goNext(); break;
        // ArrowUp   / W = 前へ
        case "ArrowUp":   case "w": case "W": e.preventDefault(); goPrev(); break;
        case " ": // スペースキーでいいね
          e.preventDefault();
          if (currentCard) handleLike(currentCard);
          break;
        default: break;
      }
    };

    // マウスホイール：連続発火を cooldown で防止
    const onWheel = (e) => {
      if (activeTab !== "feed") return;
      if (isAnimatingRef.current || wheelCooldown.current) return;
      if (Math.abs(e.deltaY) < 20) return;   // 微小スクロールは無視
      e.preventDefault();
      wheelCooldown.current = true;
      setTimeout(() => { wheelCooldown.current = false; }, 450);
      if (e.deltaY > 0) goNext();            // 下スクロール = 次へ
      else               goPrev();           // 上スクロール = 前へ
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [goNext, goPrev, handleLike, activeTab, currentCard]);

  // ─── ポインター操作（PC・スマホ統合）────────────────────────
  // Pointer Events API で mouse / touch を一本化。
  // setPointerCapture でドラッグ中にポインタを見失わない。
  const handlePointerDown = useCallback((e) => {
    if (isAnimatingRef.current) return;
    if (!e.isPrimary) return;          // マルチタッチは無視
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    dragStartRef.current   = { x: e.clientX, y: e.clientY, time: Date.now() };
    dragCurrentRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current  = false;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragStartRef.current || !e.isPrimary) return;
    dragCurrentRef.current = { x: e.clientX, y: e.clientY };
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    if (dy > 8 && dy > dx) {
      isDraggingRef.current = true;
      e.preventDefault();             // ページスクロール防止
    }
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!dragStartRef.current || !e.isPrimary) return;
    const start      = dragStartRef.current;
    const current    = dragCurrentRef.current || start;
    const dy         = current.y - start.y;
    const dx         = Math.abs(current.x - start.x);
    const elapsed    = Date.now() - start.time;
    const wasDragging = isDraggingRef.current; // リセット前に保存

    dragStartRef.current   = null;
    dragCurrentRef.current = null;
    isDraggingRef.current  = false;

    if (wasDragging && Math.abs(dy) > dx) {
      // ─ スワイプ ─
      if ((dy < -50 && elapsed < 500) || dy < -120) goNext();
      else if ((dy > 50 && elapsed < 500) || dy > 120) goPrev();
    } else if (!wasDragging && elapsed < 350 && Math.abs(dy) < 12 && dx < 12) {
      // ─ タップ（ダブルタップ判定） ─
      handleDoubleTap(currentCard);
    }
  }, [goNext, goPrev, handleDoubleTap, currentCard]);

  const handlePointerCancel = useCallback(() => {
    dragStartRef.current   = null;
    dragCurrentRef.current = null;
    isDraggingRef.current  = false;
  }, []);

  const handleClearLiked = () => {
    if (window.confirm(`いいね ${liked.length} 件をクリアしますか？`)) setLiked([]);
  };

  // 個別削除（タグ重みも-1して戻す）
  const handleRemoveFromLiked = useCallback((id) => {
    const card = liked.find((c) => c.id === id);
    if (card) applyTagDelta(card, -1);
    setLiked((prev) => prev.filter((c) => c.id !== id));
  }, [liked, applyTagDelta]);

  const likedIds = new Set(liked.map((c) => c.id));
  const showLoading = isFetchingFanza && cards.length === 0;
  const showEmpty   = !isFetchingFanza && !fanzaError && cards.length === 0;
  const isCurrentLiked = currentCard ? likedIds.has(currentCard.id) : false;

  return (
    <div
      className={`app app--shortform${activeTab === "feed" ? " is-feed" : ""}`}
      onPointerDown={activeTab === "feed" ? handlePointerDown : undefined}
      onPointerMove={activeTab === "feed" ? handlePointerMove : undefined}
      onPointerUp={activeTab === "feed" ? handlePointerUp : undefined}
      onPointerCancel={activeTab === "feed" ? handlePointerCancel : undefined}
    >
      {/* ── ヘッダー（スワイプ誤動作を防ぐ）── */}
      <header
        className="header header--shortform"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className="header-logo header-logo--btn" onClick={() => onNavigate && onNavigate("home")}>
          ⚡ {appConfig.appName}
        </button>
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
            いいね {liked.length > 0 && <span className="tab-badge">{liked.length}</span>}
          </button>
        </nav>
      </header>

      {/* ════════════════ フィードタブ ════════════════ */}
      {activeTab === "feed" && (
        <div className="shortform-stage">
          {fanzaError && (
            <div className="error-banner" role="alert">
              <span className="error-icon">⚠️</span>
              <span>{fanzaError}</span>
              <button className="error-close" onClick={() => { setFanzaError(null); handleLoadFanza(); }}>再試行</button>
            </div>
          )}

          {showLoading && (
            <div className="loading-screen">
              <p className="loading-text">動画を取得中...</p>
            </div>
          )}
          {showEmpty && (
            <div className="loading-screen">
              <p className="loading-text">表示できる動画がありませんでした。<br/>時間をおいて再度お試しください。</p>
              <button className="btn-retry" onClick={handleLoadFanza}>再試行</button>
            </div>
          )}

          {/* ── カード本体 ─────────────────────────────── */}
          {currentCard && (
            <div className={`shortform-card ${swipeDir === "up" ? "exit-up" : swipeDir === "down" ? "exit-down" : ""}`}>
              <CardContent
                card={currentCard}
                isLiked={isCurrentLiked}
                likeFlash={likeFlashId === currentCard.id}
                onLike={() => handleLike(currentCard)}
                videoRef={videoRef}
              />
            </div>
          )}

          {/* ── 見終わり ─────────────────────────────── */}
          {isAtEnd && !isFetchingFanza && (
            <div className="finished">
              <div className="finished-icon">🎉</div>
              <p className="finished-text">最後まで見ました</p>
              <button className="btn-reset" onClick={handleLoadFanza}>もっと見る</button>
            </div>
          )}

          {isFetchingMore && (
            <p className="fetching-more">次のサンプルを読み込んでいます…</p>
          )}
        </div>
      )}

      {/* ════════════════ いいね一覧タブ ════════════════ */}
      {activeTab === "liked" && (
        <LikedPage liked={liked} onClear={handleClearLiked} onRemove={handleRemoveFromLiked} />
      )}

    </div>
  );
}
