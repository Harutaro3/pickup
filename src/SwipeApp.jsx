// ═══════════════════════════════════════════════════════════════
// src/SwipeApp.jsx  ─  EroPick v1.0（クリーン書き直し版）
//
// 操作仕様：
//   縦スワイプ / ホイール / ↑↓キー … 前後のカードへ移動
//   スワイプ可能領域 … 画面全域（iframe・ボタン・リンク・タブを除く）
//   ダブルタップ / スペースキー     … いいねトグル
//   ♥ボタン                        … いいねトグル
//
// 設計メモ：
//   - Pointer Events に統一（PC / スマホ共通）
//   - [data-no-swipe] を持つ要素上ではドラッグを開始しない
//   - iframe 内のタッチは親に届かないため原理的にスワイプ不可
//     （FANZA プレーヤー操作を優先する仕様）
// ═══════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import "./site.css";
import { appConfig, getOutboundUrl } from "./config/appConfig.js";

const isDev = import.meta.env.DEV;
const log = (...args) => { if (isDev) console.log(...args); };

// ─── localStorage キー ────────────────────────────────────────
const STORAGE_KEY             = "eropick_v3";
const OLD_STORAGE_KEY         = "quickpick_v3";
const TAG_WEIGHTS_KEY         = "eropick_tagweights_v1";

// ─── ストレージユーティリティ ─────────────────────────────────
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

// ─── タグ重み（好み学習）──────────────────────────────────────
function loadTagWeights() {
  try {
    const raw = localStorage.getItem(TAG_WEIGHTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** カードの生タグスコア（ジャンル + 出演者の重み合計） */
function scoreItem(card, weights) {
  return [...(card.genres ?? []), ...(card.actresses ?? [])]
    .reduce((s, t) => s + (weights[t] ?? 0), 0);
}

/**
 * ソフトスコア：log圧縮した重みスコア。
 * 重みが育っても特定ジャンルが画面を独占しないよう影響を抑える。
 */
function softScore(card, weights) {
  const s = scoreItem(card, weights);
  return Math.sign(s) * Math.log1p(Math.abs(s));
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

/**
 * 好み反映ソート：
 *   シャッフル → ソフトスコア降順（安定ソート）
 *   同スコア帯の順序はランダムになり、重みゼロの初回は完全ランダム。
 */
function personalizeOrder(cards, weights) {
  return shuffleArray(cards).sort((a, b) => softScore(b, weights) - softScore(a, weights));
}

// ─── 重複排除・既読ユーティリティ ─────────────────────────────
function getDedupeKeys(card) {
  const keys = [];
  if (card.id)        keys.push(`id:${card.id}`);
  if (card.videoSrc)  keys.push(`v:${card.videoSrc}`);
  if (card.normalURL) keys.push(`u:${card.normalURL}`);
  return keys;
}
function appendUniqueCards(existingCards, newCards) {
  const seenSet = new Set(existingCards.flatMap(getDedupeKeys));
  const uniqueNew = newCards.filter((c) => {
    const keys = getDedupeKeys(c);
    if (keys.some((k) => seenSet.has(k))) return false;
    keys.forEach((k) => seenSet.add(k));
    return true;
  });
  return [...existingCards, ...uniqueNew];
}
function sortBySeenStatus(cards, seenIds) {
  if (seenIds.size === 0) return cards;
  const fresh = [], seen = [];
  for (const card of cards) {
    (seenIds.has(card.id) && Math.random() > 0.1 ? seen : fresh).push(card);
  }
  return [...fresh, ...seen];
}

// ═══════════════════════════════════════════════════════════════
// いいね一覧ページ
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// カード表示
//   構造（縦フロー）：
//     card-media（video / iframe / thumbnail）
//     card-overlay（タイトル・タグ・詳細リンク ＋ ♥）
// ═══════════════════════════════════════════════════════════════
function CardContent({ card, isLiked, likeFlash, onLike, onDetailClick, videoRef }) {
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
          />
          <button
            className={`btn-play-pause ${isVideoPlaying ? "btn-play-pause--playing" : ""}`}
            onClick={handlePlayPause}
            data-no-swipe
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
    <div className="card-inner">
      {likeFlash && <div className="like-flash">♥</div>}

      {/* メディア（iframe は data-no-swipe：プレーヤー操作を優先） */}
      <div
        className={isIframe ? "card-media card-media--iframe" : "card-media"}
        {...(isIframe ? { "data-no-swipe": true } : {})}
      >
        {renderMedia()}
      </div>

      {/* 情報（タイトル・タグ・リンク・♥）：この領域はスワイプ可能 */}
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
            <a
              href={outbound}
              target="_blank"
              rel="noopener noreferrer"
              className="card-detail-link"
              data-no-swipe
              onClick={() => onDetailClick && onDetailClick(card)}
            >
              詳細を見る →
            </a>
          )}
        </div>

        <button
          className={`btn-heart ${isLiked ? "btn-heart--active" : ""}`}
          onClick={onLike}
          data-no-swipe
          aria-label="いいね"
        >♥</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// メインアプリ
// ═══════════════════════════════════════════════════════════════
export default function SwipeApp({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("feed");
  const [cards, setCards]         = useState([]);
  const [current, setCurrent]     = useState(0);
  const [liked, setLiked]         = useState(() => _initialStorage().liked);
  const [tagWeights, setTagWeights] = useState(() => loadTagWeights());
  const [likeFlashId, setLikeFlashId] = useState(null);
  const [swipeDir, setSwipeDir]   = useState(null); // "up" | "down"
  const [isAnimating, setIsAnimating] = useState(false);

  const [isFetchingFanza, setIsFetchingFanza] = useState(false);
  const [isFetchingMore, setIsFetchingMore]   = useState(false);
  const [fanzaError, setFanzaError]           = useState(null);
  const fanzaOffsetRef  = useRef(1);
  const fanzaHits       = 20;
  const hasAutoLoaded   = useRef(false);

  // ─── ジャンル絞り込み ───────────────────────────────────────
  const [genres, setGenres]           = useState([]);          // [{id,name,count}]
  const [genresLoaded, setGenresLoaded] = useState(false);
  const [isGenrePanelOpen, setIsGenrePanelOpen] = useState(false);
  const [genreSearchText, setGenreSearchText]   = useState("");
  const [activeGenre, setActiveGenre] = useState(null);         // {id,name} | null
  const activeGenreRef = useRef(null);
  useEffect(() => { activeGenreRef.current = activeGenre; }, [activeGenre]);

  const cardsRef        = useRef(cards);
  const isAnimatingRef  = useRef(false);
  const videoRef        = useRef(null);
  const tagWeightsRef   = useRef(tagWeights);
  const wheelCooldown   = useRef(false);
  const lastTapRef      = useRef(0);
  const dragRef         = useRef(null);   // { x, y, time } | null
  const dragCurrentRef  = useRef(null);
  const isDraggingRef   = useRef(false);
  const currentRef      = useRef(current);

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { return () => { revokeLocalCardUrls(cardsRef.current); }; }, []); // eslint-disable-line
  useEffect(() => { saveStorage(liked); }, [liked]);
  useEffect(() => {
    tagWeightsRef.current = tagWeights;
    try { localStorage.setItem(TAG_WEIGHTS_KEY, JSON.stringify(tagWeights)); } catch {}
  }, [tagWeights]);

  // 既読ID（likedベース）
  const seenIdsRef = useRef(new Set(liked.map((c) => c.id)));
  useEffect(() => {
    seenIdsRef.current = new Set(liked.map((c) => c.id));
  }, [liked]);

  const currentCard = cards[current];
  const isAtEnd     = current >= cards.length && cards.length > 0;

  // ─── FANZA API ────────────────────────────────────────────
  async function fetchFanzaCards({ offset = 1, random = false } = {}) {
    const params = new URLSearchParams({ hits: String(fanzaHits) });
    if (random) { params.set("random", "true"); }
    else { params.set("random", "false"); params.set("offset", String(offset)); }
    const genre = activeGenreRef.current;
    if (genre?.id) params.set("genreId", genre.id);
    else if (genre?.name) params.set("keyword", genre.name); // idが無い場合はキーワードで代用
    const res = await fetch(`${appConfig.apiBase}/fanza-samples?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ─── ジャンル一覧取得（パネルを開いた時に1回だけ）───────────
  const loadGenres = useCallback(async () => {
    if (genresLoaded) return;
    try {
      const res = await fetch(`${appConfig.apiBase}/fanza-genres`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGenres(data.genres || []);
      setGenresLoaded(true);
    } catch (err) {
      log("[genres] error:", err.message);
    }
  }, [genresLoaded]);

  const openGenrePanel = () => {
    setIsGenrePanelOpen(true);
    loadGenres();
  };

  const selectGenre = (genre) => {
    activeGenreRef.current = genre;   // 同期更新（useEffect反映を待たない）
    setActiveGenre(genre);
    setIsGenrePanelOpen(false);
    setGenreSearchText("");
    handleLoadFanza();
  };

  const clearGenre = () => {
    if (!activeGenre) return;
    activeGenreRef.current = null;    // 同期更新
    setActiveGenre(null);
    handleLoadFanza(); // 通常のランダムフィードに復帰
  };

  const handleLoadFanza = useCallback(async () => {
    if (isFetchingFanza) return;
    setIsFetchingFanza(true);
    setFanzaError(null);
    try {
      revokeLocalCardUrls(cardsRef.current);
      const data = await fetchFanzaCards({ random: true });
      fanzaOffsetRef.current = data.debug?.nextOffset || (data.offset ?? 1) + fanzaHits;
      if (isDev && data.debug) log("[fanza] debug:", data.debug);
      const personalized = personalizeOrder(data.cards, tagWeightsRef.current);
      const sorted = sortBySeenStatus(personalized, seenIdsRef.current);
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
  }, [isFetchingFanza]); // eslint-disable-line

  const fetchMoreFanza = useCallback(async () => {
    if (isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      // 追加取得もランダム（マルチポイント）で偏りを防ぐ
      const data = await fetchFanzaCards({ random: true });
      fanzaOffsetRef.current = data.debug?.nextOffset || (fanzaOffsetRef.current + fanzaHits);
      const personalized = personalizeOrder(data.cards, tagWeightsRef.current);
      setCards((prev) => appendUniqueCards(prev, personalized));
    } catch (err) {
      log("[fanza] fetchMore error:", err.message);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore]); // eslint-disable-line

  // ─── 初回自動取得 ─────────────────────────────────────────
  useEffect(() => {
    if (!hasAutoLoaded.current) {
      hasAutoLoaded.current = true;
      handleLoadFanza();
    }
  }, [handleLoadFanza]);

  // 残り5件以下で追加取得
  useEffect(() => {
    const remaining = cards.length - current;
    const isFanza = cards[0]?.sourceType === "fanza" || cards[0]?.sourceType === "fanza_mock";
    if (isFanza && remaining <= 5 && remaining > 0 && !isFetchingMore && !isFetchingFanza) {
      fetchMoreFanza();
    }
  }, [current, cards.length]); // eslint-disable-line

  // ─── 前後移動 ─────────────────────────────────────────────
  const animateTo = useCallback((dir, nextIndex) => {
    isAnimatingRef.current = true;
    setIsAnimating(true);
    setSwipeDir(dir);
    const video = videoRef.current;
    if (video) { try { video.pause(); video.currentTime = 0; } catch {} }
    setTimeout(() => {
      setCurrent(nextIndex);
      setSwipeDir(null);
      isAnimatingRef.current = false;
      setIsAnimating(false);
    }, 280);
  }, []);

  const goNext = useCallback(() => {
    if (isAnimatingRef.current) return;
    const total = cardsRef.current.length;
    const cur = currentRef.current;
    if (cur >= total - 1) return;   // 末尾（fetchMore待ち）
    animateTo("up", cur + 1);
  }, [animateTo]);

  const goPrev = useCallback(() => {
    if (isAnimatingRef.current) return;
    const cur = currentRef.current;
    if (cur <= 0) return;
    animateTo("down", cur - 1);
  }, [animateTo]);

  // ─── いいね（トグル）──────────────────────────────────────
  const applyTagDelta = useCallback((card, delta) => {
    const tags = [...(card.genres ?? []), ...(card.actresses ?? [])];
    if (tags.length === 0) return;
    setTagWeights((prev) => {
      const next = { ...prev };
      tags.forEach((t) => { next[t] = (next[t] ?? 0) + delta; });
      return next;
    });
  }, []);

  const handleLike = useCallback((card) => {
    if (!card) return;
    const isCurrentlyLiked = liked.some((c) => c.id === card.id);
    if (isCurrentlyLiked) {
      setLiked((prev) => prev.filter((c) => c.id !== card.id));
      applyTagDelta(card, -1);
    } else {
      setLikeFlashId(card.id);
      setTimeout(() => setLikeFlashId(null), 600);
      setLiked((prev) => {
        if (prev.some((c) => c.id === card.id)) return prev;
        return [...prev, toStorageItem(card)];
      });
      applyTagDelta(card, 1);
    }
  }, [liked, applyTagDelta]);

  // 「詳細を見る」クリック＝軽い好みシグナル（+0.3、取り消し不可）
  const handleDetailClick = useCallback((card) => {
    if (!card) return;
    applyTagDelta(card, 0.3);
  }, [applyTagDelta]);

  // いいね一覧からの個別削除（タグ重みも戻す）
  const handleRemoveFromLiked = useCallback((id) => {
    const card = liked.find((c) => c.id === id);
    if (card) applyTagDelta(card, -1);
    setLiked((prev) => prev.filter((c) => c.id !== id));
  }, [liked, applyTagDelta]);

  const handleClearLiked = () => {
    if (window.confirm(`いいね ${liked.length} 件をクリアしますか？`)) setLiked([]);
  };

  // ─── キーボード + ホイール ────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (activeTab !== "feed") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (["input","textarea","select","video"].includes(tag)) return;
      switch (e.key) {
        case "ArrowDown": case "s": case "S": e.preventDefault(); goNext(); break;
        case "ArrowUp":   case "w": case "W": e.preventDefault(); goPrev(); break;
        case " ":
          e.preventDefault();
          { const c = cardsRef.current[currentRef.current]; if (c) handleLike(c); }
          break;
        default: break;
      }
    };
    const onWheel = (e) => {
      if (activeTab !== "feed") return;
      if (isAnimatingRef.current || wheelCooldown.current) return;
      if (Math.abs(e.deltaY) < 20) return;
      e.preventDefault();
      wheelCooldown.current = true;
      setTimeout(() => { wheelCooldown.current = false; }, 450);
      if (e.deltaY > 0) goNext(); else goPrev();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [goNext, goPrev, handleLike, activeTab]);

  // ─── ポインター操作（PC / スマホ統合）─────────────────────
  const handlePointerDown = useCallback((e) => {
    if (isAnimatingRef.current) return;
    if (!e.isPrimary) return;
    // ボタン・リンク・iframe など操作要素上ではドラッグを開始しない
    if (e.target.closest("[data-no-swipe]")) return;
    dragRef.current        = { x: e.clientX, y: e.clientY, time: Date.now() };
    dragCurrentRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current  = false;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current || !e.isPrimary) return;
    dragCurrentRef.current = { x: e.clientX, y: e.clientY };
    const dy = Math.abs(e.clientY - dragRef.current.y);
    const dx = Math.abs(e.clientX - dragRef.current.x);
    if (!isDraggingRef.current && dy > 8 && dy > dx) {
      isDraggingRef.current = true;
      // ドラッグ確定後にキャプチャ（ボタンのclickを邪魔しない）
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    }
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!dragRef.current || !e.isPrimary) return;
    const start       = dragRef.current;
    const cur         = dragCurrentRef.current || start;
    const dy          = cur.y - start.y;
    const dx          = Math.abs(cur.x - start.x);
    const elapsed     = Date.now() - start.time;
    const wasDragging = isDraggingRef.current;

    dragRef.current        = null;
    dragCurrentRef.current = null;
    isDraggingRef.current  = false;

    if (wasDragging && Math.abs(dy) > dx) {
      // スワイプ確定
      if ((dy < -50 && elapsed < 500) || dy < -120) goNext();
      else if ((dy > 50 && elapsed < 500) || dy > 120) goPrev();
    } else if (!wasDragging && elapsed < 350 && Math.abs(dy) < 12 && dx < 12) {
      // タップ → ダブルタップ判定
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        const card = cardsRef.current[currentRef.current];
        if (card) handleLike(card);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  }, [goNext, goPrev, handleLike]);

  const handlePointerCancel = useCallback(() => {
    dragRef.current        = null;
    dragCurrentRef.current = null;
    isDraggingRef.current  = false;
  }, []);

  // ─── レンダリング ─────────────────────────────────────────
  const likedIds       = new Set(liked.map((c) => c.id));
  const showLoading    = isFetchingFanza && cards.length === 0;
  const showEmpty      = !isFetchingFanza && !fanzaError && cards.length === 0;
  const isCurrentLiked = currentCard ? likedIds.has(currentCard.id) : false;
  const isFeed         = activeTab === "feed";

  return (
    <div
      className={`app app--shortform${isFeed ? " is-feed" : ""}`}
      onPointerDown={isFeed ? handlePointerDown : undefined}
      onPointerMove={isFeed ? handlePointerMove : undefined}
      onPointerUp={isFeed ? handlePointerUp : undefined}
      onPointerCancel={isFeed ? handlePointerCancel : undefined}
    >
      {/* ── ヘッダー ─────────────────────────────────── */}
      <header className="header header--shortform" data-no-swipe>
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
          {activeTab === "feed" && (
            <button
              className={`tab-btn tab-btn--icon ${activeGenre ? "tab-btn--active" : ""}`}
              onClick={openGenrePanel}
              aria-label="ジャンルで絞り込む"
            >
              🔍
            </button>
          )}
        </nav>
      </header>

      {/* ── ジャンル絞り込みパネル ─────────────────────── */}
      {isGenrePanelOpen && (
        <div className="genre-panel-backdrop" data-no-swipe onClick={() => setIsGenrePanelOpen(false)}>
          <div className="genre-panel" onClick={(e) => e.stopPropagation()}>
            <div className="genre-panel-header">
              <h3>ジャンルで絞り込む</h3>
              <button className="genre-panel-close" onClick={() => setIsGenrePanelOpen(false)}>✕</button>
            </div>
            <input
              type="text"
              className="genre-search-input"
              placeholder="ジャンルを検索…"
              value={genreSearchText}
              onChange={(e) => setGenreSearchText(e.target.value)}
              autoFocus
            />
            <div className="genre-chip-list">
              {!genresLoaded && (
                <p className="genre-loading">ジャンル一覧を読み込み中…</p>
              )}
              {genresLoaded && genres.length === 0 && (
                <p className="genre-loading">ジャンル一覧を取得できませんでした</p>
              )}
              {genresLoaded && genres
                .filter((g) => g.name.includes(genreSearchText))
                .slice(0, 200)
                .map((g) => (
                  <button
                    key={g.id ?? g.name}
                    className={`genre-chip ${activeGenre?.name === g.name ? "genre-chip--active" : ""}`}
                    onClick={() => selectGenre(g)}
                  >
                    {g.name}
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ════════ フィード ════════ */}
      {activeTab === "feed" && (
        <div className="shortform-stage">
          {activeGenre && (
            <div className="active-genre-badge" data-no-swipe>
              絞り込み中: {activeGenre.name}
              <button className="active-genre-clear" onClick={clearGenre} aria-label="絞り込み解除">✕</button>
            </div>
          )}

          {fanzaError && (
            <div className="error-banner" role="alert" data-no-swipe>
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
              <button className="btn-retry" onClick={handleLoadFanza} data-no-swipe>再試行</button>
            </div>
          )}

          {currentCard && (
            <div className={`shortform-card ${swipeDir === "up" ? "exit-up" : swipeDir === "down" ? "exit-down" : ""}`}>
              <CardContent
                card={currentCard}
                isLiked={isCurrentLiked}
                likeFlash={likeFlashId === currentCard.id}
                onLike={() => handleLike(currentCard)}
                onDetailClick={handleDetailClick}
                videoRef={videoRef}
              />
            </div>
          )}

          {isAtEnd && !isFetchingFanza && (
            <div className="finished">
              <div className="finished-icon">🎉</div>
              <p className="finished-text">最後まで見ました</p>
              <button className="btn-reset" onClick={handleLoadFanza} data-no-swipe>もっと見る</button>
            </div>
          )}

          {isFetchingMore && (
            <p className="fetching-more">次のサンプルを読み込んでいます…</p>
          )}
        </div>
      )}

      {/* ════════ いいね一覧 ════════ */}
      {activeTab === "liked" && (
        <LikedPage liked={liked} onClear={handleClearLiked} onRemove={handleRemoveFromLiked} />
      )}
    </div>
  );
}
