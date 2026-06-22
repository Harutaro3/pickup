import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import "./site.css";
import { appConfig, getOutboundUrl } from "./config/appConfig.js";

const isDev = import.meta.env.DEV;
const log = (...args) => { if (isDev) console.log(...args); };

// ─── localStorage キー ────────────────────────────────────────
// 旧キー（quickpick_*）から新キー（eropick_*）へ移行済み
const STORAGE_KEY         = "eropick_v3";
const HISTORY_STORAGE_KEY = "eropick_history_v3";
const OLD_STORAGE_KEY         = "quickpick_v3";
const OLD_HISTORY_STORAGE_KEY = "quickpick_history_v3";

// ─── localStorage ヘルパー ────────────────────────────────────
function loadStorage() {
  try {
    // 新キーを優先、なければ旧キーから移行
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ liked, disliked })); } catch {}
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
function toHistoryItem(card, decision) {
  return {
    id: card.id, decision,
    title: card.title, actresses: card.actresses || [],
    genres: card.genres || [], maker: card.maker || "",
    series: card.series || "", sourceType: card.sourceType,
    decidedAt: new Date().toISOString(),
  };
}
function toStorageItem(card) {
  return {
    id: card.id, title: card.title,
    tags: card.tags ?? [], sourceType: card.sourceType ?? "fanza",
    actresses: card.actresses || [], genres: card.genres || [],
    maker: card.maker || "", imageUrl: card.imageUrl || "",
    normalURL: card.normalURL || card.URL || "",
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

// ─── 重複排除 ──────────────────────────────────────────────────
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
      const preferredIndex = pool.findIndex((card) => {
        const sameMaker   = prev.maker  && card.maker  && prev.maker  === card.maker;
        const sameSeries  = prev.series && card.series && prev.series === card.series;
        const sameActress = hasIntersection(prev.actresses || [], card.actresses || []);
        return !sameMaker && !sameSeries && !sameActress;
      });
      if (preferredIndex >= 0) index = preferredIndex;
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
  const diversified = reorderDiverse(uniqueNew);
  const lastExisting = existingCards[existingCards.length - 1];
  if (lastExisting && diversified.length > 1) {
    const first = diversified[0];
    const sameMaker = lastExisting.maker && first.maker && lastExisting.maker === first.maker;
    if (sameMaker) {
      const swapIndex = diversified.findIndex((c, i) => {
        if (i === 0) return false;
        return !(lastExisting.maker && c.maker && lastExisting.maker === c.maker);
      });
      if (swapIndex > 0) [diversified[0], diversified[swapIndex]] = [diversified[swapIndex], diversified[0]];
    }
  }
  return [...existingCards, ...diversified];
}

const REAPPEAR_RATE = 0.1;
function sortBySeenStatus(cards, seenIds) {
  if (seenIds.size === 0) return cards;
  const fresh = [], seen = [];
  for (const card of cards) {
    if (seenIds.has(card.id)) {
      if (Math.random() < REAPPEAR_RATE) fresh.push(card);
      else seen.push(card);
    } else { fresh.push(card); }
  }
  return [...fresh, ...seen];
}

// ─── 好き一覧ページ ────────────────────────────────────────────
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
        {[...liked].reverse().map((card) => {
          const outbound = getOutboundUrl(card);
          return (
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
                {outbound && (
                  <a href={outbound} target="_blank" rel="noopener noreferrer" className="liked-card-link">
                    詳細を見る →
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CardContent ──────────────────────────────────────────────
function CardContent({ card, index, total, likeOpacity, nopeOpacity, videoRef }) {
  const isIframe = card.sampleType === "iframe" && card.videoSrc;
  const renderMedia = () => {
    if (card.sampleType === "video" && card.videoSrc) {
      return (
        <video
          ref={videoRef}
          src={card.videoSrc}
          controls playsInline preload="metadata"
          className="card-video"
          onClick={(e) => e.stopPropagation()}
        />
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
          ref={(el) => {
            if (el && isDev) {
              log("[iframe]", { id: card.id, sampleType: card.sampleType, mediaHeight: el.parentElement?.clientHeight });
            }
          }}
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
  const outbound = getOutboundUrl(card);
  return (
    <>
      <div className="stamp stamp-like" style={{ opacity: likeOpacity }}>LIKE ♥</div>
      <div className="stamp stamp-nope" style={{ opacity: nopeOpacity }}>NOPE ✕</div>
      <div className={isIframe ? "card-media card-media--iframe" : "card-media"}>
        {renderMedia()}
      </div>
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
    </>
  );
}

// ─── VideoCard ────────────────────────────────────────────────
function VideoCard({ card, index, total, isBack, isEntering, videoRef, dragState, onDragStart, onDragMove, onDragEnd }) {
  const startRef = useRef(null);
  const isDragging = useRef(false);
  const dx = dragState?.dx ?? 0;
  const dy = dragState?.dy ?? 0;
  const rotation = dx * 0.06;
  const opacity = dragState ? Math.max(0.4, 1 - Math.abs(dx) / 500) : 1;
  const likeOpacity = dragState ? Math.max(0, dx  / 120) : 0;
  const nopeOpacity = dragState ? Math.max(0, -dx / 120) : 0;
  const frontStyle = {
    transform: dragState ? `translate(${dx}px, ${dy * 0.3}px) rotate(${rotation}deg)` : "",
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
    startRef.current = null;
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
      onMouseDown={handlePointerDown} onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
    >
      <CardContent card={card} index={index} total={total}
        likeOpacity={likeOpacity} nopeOpacity={nopeOpacity} videoRef={videoRef} />
    </div>
  );
}

// ─── メインアプリ ─────────────────────────────────────────────
export default function SwipeApp({ onNavigate }) {
  const [activeTab, setActiveTab]   = useState("feed");
  const [cards, setCards]           = useState([]);       // 初期は空（年齢確認後に自動取得）
  const [current, setCurrent]       = useState(0);
  const [liked, setLiked]           = useState(() => _initialStorage().liked);
  const [disliked, setDisliked]     = useState(() => _initialStorage().disliked);
  const [decisionHistory, setDecisionHistory] = useState(() => loadHistory());
  const [dragState, setDragState]   = useState(null);
  const [exitDir, setExitDir]       = useState(null);
  const [isEntering, setIsEntering] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const [isFetchingFanza, setIsFetchingFanza] = useState(false);
  const [isFetchingMore, setIsFetchingMore]   = useState(false);
  const [fanzaError, setFanzaError]           = useState(null);
  const fanzaOffsetRef  = useRef(1);
  const fanzaHits       = 20;
  const hasAutoLoaded   = useRef(false); // 自動取得済みフラグ

  const cardsRef       = useRef(cards);
  const isAnimatingRef = useRef(false);
  const videoRef       = useRef(null);

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { return () => { revokeLocalCardUrls(cardsRef.current); }; }, []); // eslint-disable-line
  useEffect(() => { saveStorage(liked, disliked); }, [liked, disliked]);
  useEffect(() => { saveHistory(decisionHistory); }, [decisionHistory]);

  const currentCard = cards[current];
  const nextCard    = cards[current + 1] ?? null;
  const finished    = current >= cards.length && cards.length > 0;

  const seenIdsRef = useRef(new Set(decisionHistory.map((h) => h.id)));
  useEffect(() => {
    seenIdsRef.current = new Set(decisionHistory.map((h) => h.id));
  }, [decisionHistory]);

  // ─── 年齢確認後に自動でFANZA取得を開始 ─────────────────────
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
    log(`[fanza] fetch offset=${offset} random=${random}`);
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
      const sorted = sortBySeenStatus(data.cards, seenIdsRef.current);
      setCards(sorted);
      setCurrent(0);
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setExitDir(null);
      setDragState(null);
      setActiveTab("feed");
    } catch (err) {
      log("[fanza] fetch error:", err.message);
      setFanzaError("動画を取得できませんでした。時間をおいて再度お試しください。");
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
      fanzaOffsetRef.current = data.debug?.nextOffset || (currentOffset + fanzaHits);
      if (isDev && data.debug) log(`[fanza] fetchMore debug:`, data.debug);
      setCards((prev) => {
        const appended = appendUniqueCards(prev, data.cards);
        log(`[fanza] +${appended.length - prev.length} unique cards`);
        return appended;
      });
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

  // 次カード自動再生（video型のみ）
  useEffect(() => {
    if (finished || cards.length === 0) return;
    const card = cards[current];
    if (card?.sampleType !== "video" || !card?.videoSrc) return;
    const timer = setTimeout(() => {
      videoRef.current?.play().catch(() => {});
    }, 460);
    return () => clearTimeout(timer);
  }, [current]); // eslint-disable-line

  // ─── スワイプ確定 ─────────────────────────────────────────────
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
      if (dir === "right") setLiked((prev) => [...prev, storeItem]);
      else setDisliked((prev) => [...prev, storeItem]);
      setDecisionHistory((prev) => [...prev, histItem]);
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

  // ─── キーボード ───────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeTab !== "feed") return;
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

  // ─── ドラッグ ─────────────────────────────────────────────────
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

  const handleClearLiked = () => {
    if (window.confirm(`好き ${liked.length} 件をクリアしますか？`)) setLiked([]);
  };

  const frontSlotClass = [
    "card-slot", "card-slot--front",
    exitDir === "right" ? "exit-right" : "",
    exitDir === "left"  ? "exit-left"  : "",
  ].filter(Boolean).join(" ");

  // ─── ローディング・空状態 ──────────────────────────────────────
  const showLoading = isFetchingFanza && cards.length === 0;
  const showEmpty   = !isFetchingFanza && !fanzaError && cards.length === 0;

  return (
    <div className="app">
      {/* ── ヘッダー ─────────────────────────────────────── */}
      <header className="header">
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
            好き {liked.length > 0 && <span className="tab-badge">{liked.length}</span>}
          </button>
        </nav>
      </header>

      {/* ════════════════════════════════════
          フィードタブ
      ════════════════════════════════════ */}
      {activeTab === "feed" && (
        <>
          {/* ── エラーバナー ─────────────────────────── */}
          {fanzaError && (
            <div className="error-banner" role="alert">
              <span className="error-icon">⚠️</span>
              <span>{fanzaError}</span>
              <button className="error-close" onClick={() => { setFanzaError(null); handleLoadFanza(); }}>再試行</button>
            </div>
          )}

          {/* ── ローディング ─────────────────────────── */}
          {showLoading && (
            <div className="loading-screen">
              <p className="loading-text">動画を取得中...</p>
            </div>
          )}

          {/* ── 空状態 ───────────────────────────────── */}
          {showEmpty && (
            <div className="loading-screen">
              <p className="loading-text">表示できる動画がありませんでした。<br/>時間をおいて再度お試しください。</p>
              <button className="btn-retry" onClick={handleLoadFanza}>再試行</button>
            </div>
          )}

          {/* ── 追加取得中 ───────────────────────────── */}
          {isFetchingMore && <p className="fetching-more">次のサンプルを読み込んでいます…</p>}

          {/* ── カードエリア ─────────────────────────── */}
          {cards.length > 0 && (
            <main className="stage">
              {finished ? (
                <div className="finished">
                  <div className="finished-icon">🎉</div>
                  <p className="finished-text">すべて見終わりました</p>
                  <p className="finished-sub">♥ {liked.length} 件 好き</p>
                  <button className="btn-reset" onClick={handleLoadFanza}>もっと見る</button>
                </div>
              ) : (
                <div className="card-stack">
                  {nextCard && (
                    <div className="card-slot card-slot--back">
                      <VideoCard key={`back-${nextCard.id}`}
                        card={nextCard} index={current + 1} total={cards.length}
                        isBack={true} isEntering={false} videoRef={null} />
                    </div>
                  )}
                  <div className={frontSlotClass}>
                    <VideoCard key={`front-${currentCard.id}`}
                      card={currentCard} index={current} total={cards.length}
                      isBack={false} isEntering={isEntering} videoRef={videoRef}
                      dragState={dragState}
                      onDragStart={handleDragStart}
                      onDragMove={handleDragMove}
                      onDragEnd={handleDragEnd} />
                  </div>
                </div>
              )}
            </main>
          )}

          {/* ── アクションボタン ─────────────────────── */}
          {cards.length > 0 && !finished && (
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
          {cards.length > 0 && !finished && (
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

      {/* ── 注意文 ───────────────────────────────────────── */}
      <footer className="swipe-footer">
        <p className="swipe-notice">
          {appConfig.appName}は、成人向け作品のサンプル動画をスワイプ感覚で探せる非公式サービスです。
          18歳未満の方は利用できません。本サービスはFANZA公式サービスではありません。
          詳細リンクは通常の商品ページURLを使用しています。
        </p>
      </footer>
    </div>
  );
}
