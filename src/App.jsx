import { useState, useEffect } from "react";
import "./site.css";
import SwipeApp from "./SwipeApp.jsx";
import { appConfig } from "./config/appConfig.js";
import {
  HomePage, WorksPage, WorkDetailPage, HowToPage, AboutPage,
  Article1Page, Article2Page, Article3Page,
  PrivacyPage, TermsPage, ContactPage, OperatorPage, AdsPage,
} from "./pages.jsx";

const AGE_KEY     = "eropick_age_verified";
const AGE_KEY_OLD = "quickpick_age_verified"; // 旧キー（移行用）

// ─── 年齢確認ゲート ───────────────────────────────────────────
function AgeGate({ onVerified }) {
  const [rejected, setRejected] = useState(false);

  if (rejected) {
    return (
      <div className="age-gate">
        <div className="age-box">
          <h1 className="age-title">このサイトは閲覧できません</h1>
          <p className="age-text">
            EroPickは成人向け作品のサンプル動画を探せる非公式サービスです。
            18歳未満の方はご利用いただけません。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="age-gate">
      <div className="age-box">
        <h1 className="age-logo">⚡ {appConfig.appName}</h1>
        <h2 className="age-title">年齢確認</h2>
        <p className="age-text">
          EroPickは成人向け作品のサンプル動画を探せる非公式サービスです。
          18歳未満の方はご利用いただけません。
        </p>
        <p className="age-question">あなたは18歳以上ですか？</p>
        <div className="age-actions">
          <button
            className="age-btn age-btn--yes"
            onClick={() => {
              try { localStorage.setItem(AGE_KEY, "true"); } catch {}
              onVerified();
            }}
          >
            18歳以上です
          </button>
          <button className="age-btn age-btn--no" onClick={() => setRejected(true)}>
            18歳未満です
          </button>
        </div>
        <p className="age-note">
          ※ 現在はデモ版です。掲載中のサンプル作品はすべて審査・説明用の架空データです。
        </p>
      </div>
    </div>
  );
}

// ─── フッター ─────────────────────────────────────────────────
const FOOTER_LINKS = [
  ["home",      "ホーム"],
  ["works",     "サンプル作品一覧"],
  ["swipe",     "スワイプデモ"],
  ["howto",     "使い方"],
  ["about",     "EroPickについて"],
  ["article-1", "開発記事"],
  ["privacy",   "プライバシーポリシー"],
  ["terms",     "利用規約"],
  ["contact",   "お問い合わせ"],
  ["operator",  "運営者情報"],
  ["ads",       "広告掲載について"],
];

function Footer({ onNavigate, onResetAge }) {
  return (
    <footer className="site-footer">
      <nav className="footer-nav">
        {FOOTER_LINKS.map(([route, label]) => (
          <button key={route} className="footer-link" onClick={() => onNavigate(route)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="footer-bottom">
        <span className="footer-copy">© {appConfig.appName}（デモ版）</span>
        <button className="footer-reset" onClick={onResetAge}>年齢確認をリセット</button>
      </div>
    </footer>
  );
}

// ─── トップナビ（フッター以外の遷移用・簡易）──────────────────
function TopNav({ onNavigate }) {
  return (
    <div className="top-nav">
      <button className="top-nav-logo" onClick={() => onNavigate("home")}>⚡ {appConfig.appName}</button>
      <div className="top-nav-links">
        <button onClick={() => onNavigate("works")}>作品</button>
        <button onClick={() => onNavigate("swipe")}>スワイプ</button>
        <button onClick={() => onNavigate("about")}>About</button>
      </div>
    </div>
  );
}

// ─── メインアプリ（ルーター）──────────────────────────────────
export default function App() {
  const [ageVerified, setAgeVerified] = useState(() => {
    try {
      // 新キーを優先。なければ旧キーから移行。
      if (localStorage.getItem(AGE_KEY) === "true") return true;
      if (localStorage.getItem(AGE_KEY_OLD) === "true") {
        localStorage.setItem(AGE_KEY, "true");
        return true;
      }
      return false;
    } catch { return false; }
  });
  const [route, setRoute] = useState("home");

  // ルート変更時はページ最上部へスクロール
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const handleResetAge = () => {
    try { localStorage.removeItem(AGE_KEY); localStorage.removeItem(AGE_KEY_OLD); } catch {}
    setAgeVerified(false);
    setRoute("home");
  };

  // 年齢未確認ならゲートのみ
  if (!ageVerified) {
    return <AgeGate onVerified={() => setAgeVerified(true)} />;
  }

  // 年齢確認済みなら即スワイプ画面（トップページをスキップ）
  if (route === "swipe" || route === "home") {
    return <SwipeApp onNavigate={setRoute} />;
  }

  // 作品詳細ページ（work-xxx）
  const renderPage = () => {
    if (route.startsWith("work-")) {
      const workId = route.replace("work-", "");
      return <WorkDetailPage workId={workId} onNavigate={setRoute} />;
    }
    switch (route) {
      case "home":      return <HomePage onNavigate={setRoute} />;
      case "works":     return <WorksPage onNavigate={setRoute} />;
      case "howto":     return <HowToPage />;
      case "about":     return <AboutPage />;
      case "article-1": return <Article1Page onNavigate={setRoute} />;
      case "article-2": return <Article2Page onNavigate={setRoute} />;
      case "article-3": return <Article3Page onNavigate={setRoute} />;
      case "privacy":   return <PrivacyPage />;
      case "terms":     return <TermsPage />;
      case "contact":   return <ContactPage />;
      case "operator":  return <OperatorPage />;
      case "ads":       return <AdsPage />;
      default:          return <HomePage onNavigate={setRoute} />;
    }
  };

  return (
    <div className="site">
      <TopNav onNavigate={setRoute} />
      {/* 全下層ページ共通のパンくず（ホームへ戻る導線）*/}
      {route !== "home" && (
        <div className="breadcrumb">
          <button className="breadcrumb-home" onClick={() => setRoute("home")}>
            🏠 ホーム
          </button>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-current">{routeLabel(route)}</span>
        </div>
      )}
      <main className="site-main">{renderPage()}</main>
      <Footer onNavigate={setRoute} onResetAge={handleResetAge} />
    </div>
  );
}

// ルート名 → 表示ラベル
function routeLabel(route) {
  if (route.startsWith("work-")) return "サンプル作品詳細";
  const map = {
    works:     "サンプル作品一覧",
    howto:     "使い方",
    about:     "EroPickについて",
    "article-1": "開発記事",
    "article-2": "開発記事",
    "article-3": "開発記事",
    privacy:   "プライバシーポリシー",
    terms:     "利用規約",
    contact:   "お問い合わせ",
    operator:  "運営者情報",
    ads:       "広告掲載について",
  };
  return map[route] || "ページ";
}
