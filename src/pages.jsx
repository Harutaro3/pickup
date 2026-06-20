import { useState } from "react";
import { SAMPLE_WORKS } from "./sampleWorks.js";
import { appConfig } from "./config/appConfig.js";

// ─────────────────────────────────────────────────────────────
// 共通: ページラッパー
// ─────────────────────────────────────────────────────────────
function Page({ title, children }) {
  return (
    <div className="page">
      {title && <h1 className="page-title">{title}</h1>}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// トップページ
// ─────────────────────────────────────────────────────────────
export function HomePage({ onNavigate }) {
  return (
    <div className="page page--home">
      <section className="hero">
        <h1 className="hero-logo">⚡ {appConfig.appName}</h1>
        <p className="hero-catch">スワイプで好みの作品を見つける</p>
        <p className="hero-desc">
          QuickPickは、作品を1つずつサンプル動画で見ながら、直感的に好みを選べる作品発見
          サービスです。将来的には、提携サービスの正式なサンプル動画・商品データを利用し、
          成人向け作品をスワイプ形式で探せるサイトを目指しています。
        </p>
        <span className="demo-badge">現在はデモ版です</span>
        <div className="hero-actions">
          <button className="cta cta--primary" onClick={() => onNavigate("swipe")}>
            スワイプデモを試す
          </button>
          <button className="cta" onClick={() => onNavigate("works")}>
            サンプル作品一覧
          </button>
        </div>
      </section>

      <section className="home-links">
        <button className="home-link" onClick={() => onNavigate("howto")}>
          <span className="home-link-icon">📖</span>
          <span className="home-link-label">使い方</span>
        </button>
        <button className="home-link" onClick={() => onNavigate("article-1")}>
          <span className="home-link-icon">✍️</span>
          <span className="home-link-label">開発記事</span>
        </button>
        <button className="home-link" onClick={() => onNavigate("about")}>
          <span className="home-link-icon">ℹ️</span>
          <span className="home-link-label">QuickPickについて</span>
        </button>
        <button className="home-link" onClick={() => onNavigate("works")}>
          <span className="home-link-icon">🗂️</span>
          <span className="home-link-label">サンプル作品</span>
        </button>
      </section>

      <section className="home-statement">
        <p>
          QuickPickは現在デモ版です。正式版では、DMM/FANZAアフィリエイト承認後、許可された
          商品情報・広告素材・リンクを使用し、成人向け作品をスワイプ形式で探せるサービスとして
          運営予定です。現在掲載しているサンプル作品・画像・動画・説明文は、すべて審査説明用の
          架空データです。
        </p>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// サンプル作品一覧
// ─────────────────────────────────────────────────────────────
export function WorksPage({ onNavigate }) {
  return (
    <Page title="サンプル作品一覧">
      <p className="page-note">
        ※ ここに掲載しているのは、すべてデモ用の架空データです。動画は図形とテキストのみの
        安全なサンプルで、実在の作品・人物・メーカー・商品とは一切関係ありません。正式版では、
        提携サービスから許可されたサンプル動画・作品情報を使用する予定です。
      </p>
      <div className="works-grid">
        {SAMPLE_WORKS.map((w) => (
          <div key={w.id} className="work-card">
            <div className="work-thumb work-thumb--video">
              <video
                src={w.videoSrc}
                muted
                loop
                playsInline
                preload="metadata"
                className="work-thumb-video"
                onMouseEnter={(e) => e.target.play().catch(() => {})}
                onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
              />
              <span className="work-orient-badge">
                {w.orientation === "landscape" ? "横" : "縦"}
              </span>
            </div>
            <div className="work-info">
              <h2 className="work-title">{w.title}</h2>
              <div className="work-tags">
                {w.genres.map((g) => (
                  <span key={g} className="tag tag--sm">{g}</span>
                ))}
              </div>
              <p className="work-summary">{w.summary}</p>
              <p className="work-duration">想定再生時間: 約{w.durationMin}分</p>
              <div className="work-actions">
                <button className="cta cta--sm" onClick={() => onNavigate(`work-${w.id}`)}>
                  詳細を見る
                </button>
                <button className="cta cta--sm cta--primary" onClick={() => onNavigate("swipe")}>
                  スワイプで探す
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// サンプル作品詳細
// ─────────────────────────────────────────────────────────────
export function WorkDetailPage({ workId, onNavigate }) {
  const work = SAMPLE_WORKS.find((w) => w.id === workId);
  if (!work) {
    return (
      <Page title="作品が見つかりません">
        <button className="cta" onClick={() => onNavigate("works")}>一覧へ戻る</button>
      </Page>
    );
  }
  return (
    <Page>
      <div className="work-detail-video">
        <video
          src={work.videoSrc}
          controls
          playsInline
          preload="metadata"
          className="work-detail-player"
        />
      </div>
      <h1 className="page-title">{work.title}</h1>
      <div className="work-tags">
        {work.genres.map((g) => (
          <span key={g} className="tag tag--sm">{g}</span>
        ))}
      </div>
      <p className="work-detail-desc">{work.description}</p>

      <h2 className="section-heading">見どころ</h2>
      <ul className="highlight-list">
        {work.highlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>

      <p className="page-note">
        正式版では提携サービスの商品ページへ移動できる予定です。現時点では購入リンクや
        外部商品リンクは設置していません。{work.notice}
      </p>

      <div className="work-actions">
        <button className="cta" onClick={() => onNavigate("works")}>← 一覧へ戻る</button>
        <button className="cta cta--primary" onClick={() => onNavigate("swipe")}>スワイプで探す</button>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// 使い方
// ─────────────────────────────────────────────────────────────
export function HowToPage() {
  return (
    <Page title="使い方">
      <ol className="howto-list">
        <li>
          <strong>サンプル作品を見る</strong>
          <p>サンプル作品一覧から、どんな作品が並ぶのかを確認できます。</p>
        </li>
        <li>
          <strong>気になる作品を選ぶ</strong>
          <p>詳細ページで、作品の雰囲気や見どころをチェックできます。</p>
        </li>
        <li>
          <strong>スワイプ画面でLike / Dislikeする</strong>
          <p>カードを右（好き）・左（興味なし）にスワイプして、直感的に選んでいきます。</p>
        </li>
        <li>
          <strong>将来的にはお気に入りや履歴から再確認できる予定</strong>
          <p>好きに入れた作品は「好き」タブにまとまります。正式版では履歴やおすすめも追加予定です。</p>
        </li>
      </ol>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// About
// ─────────────────────────────────────────────────────────────
export function AboutPage() {
  return (
    <Page title="QuickPickについて">
      <p>
        QuickPickは、作品を1つずつ見ながら直感的に好みを選べる「作品発見サービス」です。
        検索条件を細かく指定するのではなく、カードを次々と見ながら感覚的に選んでいく
        スタイルを採用しています。
      </p>
      <p>
        現在のQuickPickは<strong>デモ版</strong>です。掲載しているサンプル作品は、すべて
        審査・説明のための架空データであり、実在の作品・人物・メーカーとは関係ありません。
      </p>
      <p>
        将来的には、DMM/FANZAアフィリエイトの承認後、許可されたデータを用いて作品紹介を
        行う予定です。無断転載ではなく、提携後に認められた方法でのみ作品情報を扱う方針です。
      </p>
      <p>
        スワイプUIによって、検索とは違う「眺めて出会う」作品探しの体験を作ることを目指しています。
      </p>
      <div className="statement-box">
        QuickPickは現在デモ版です。正式版では、提携サービスから許可された商品情報・広告素材を
        利用し、成人向け作品をスワイプ形式で探せるサービスとして運営予定です。現在掲載している
        サンプル作品は、すべて審査・説明用の架空データです。
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// 記事1: 使い方紹介
// ─────────────────────────────────────────────────────────────
export function Article1Page({ onNavigate }) {
  return (
    <Page title="QuickPickの使い方｜スワイプで好みの作品を見つける">
      <p className="article-lead">
        QuickPickは、たくさんの作品の中から「なんとなく気になるもの」を、スワイプ操作で
        直感的に見つけていくための作品発見サービスです。この記事では、基本的な使い方と、
        QuickPickがどんな体験を目指しているのかを紹介します。
      </p>

      <h2 className="section-heading">QuickPickとは何か</h2>
      <p>
        QuickPickは、作品を1枚ずつカード形式で表示し、右か左にスワイプするだけで好みを
        選んでいけるサービスです。一覧をスクロールして探すのとは違い、目の前の1作品に集中
        できるため、「気づいたら良いものに出会っていた」という体験を作ることを目指しています。
      </p>

      <h2 className="section-heading">スワイプ操作の説明</h2>
      <p>
        操作はとてもシンプルです。カードを右に動かすと「好き」、左に動かすと「興味なし」として
        記録されます。マウスでもタッチでも操作でき、キーボードの矢印キーにも対応しています。
        テンポよく次々と判断していけるので、長時間スクロールして疲れることがありません。
      </p>

      <h2 className="section-heading">Like / Dislikeの意味</h2>
      <p>
        「好き（Like）」を選んだ作品は、あとから「好き」タブでまとめて見返せます。
        「興味なし（Dislike）」を選んだ作品は、表示されにくくなっていきます。こうして
        使い込むほど、自分の好みに近い作品が前に出てくるようになる仕組みを目指しています。
      </p>

      <h2 className="section-heading">サンプル作品一覧の見方</h2>
      <p>
        サンプル作品一覧では、各作品のジャンルタグ・短い紹介文・想定再生時間が確認できます。
        気になった作品は詳細ページで、もう少し詳しい説明や見どころを読むことができます。
        現在表示しているのは、すべて審査・説明用の架空データです。
      </p>

      <h2 className="section-heading">今後追加予定の機能</h2>
      <p>
        正式版では、提携サービスから許可された作品情報を利用し、より実用的な作品探しが
        できるようにする予定です。また、お気に入りの整理機能や閲覧履歴、好みに合わせた
        おすすめの精度向上なども検討しています。
      </p>

      <div className="article-footer">
        <button className="cta cta--primary" onClick={() => onNavigate("swipe")}>
          スワイプデモを試す
        </button>
        <button className="cta" onClick={() => onNavigate("article-2")}>
          次の記事を読む →
        </button>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// 記事2: 開発理由
// ─────────────────────────────────────────────────────────────
export function Article2Page({ onNavigate }) {
  return (
    <Page title="QuickPickを作った理由｜検索ではなく直感で作品を探すために">
      <p className="article-lead">
        作品の数が増えるほど、「何を見ればいいか分からない」という悩みが生まれます。
        QuickPickは、その悩みを「直感的なスワイプ」で解きほぐすために作りました。
      </p>

      <h2 className="section-heading">作品数が多いと探すのが大変</h2>
      <p>
        選択肢が多いことは嬉しい一方で、数が多すぎると逆に選べなくなることがあります。
        一覧を延々とスクロールしているうちに疲れてしまい、結局決められない。そんな経験を
        した人は少なくないはずです。QuickPickは、この「選びきれない問題」に向き合っています。
      </p>

      <h2 className="section-heading">検索条件を考えるのが面倒な人もいる</h2>
      <p>
        ジャンルや条件を細かく指定する検索は便利ですが、そもそも「自分が何を見たいのか」が
        はっきりしないこともあります。条件を考えること自体が面倒に感じる場面もあるでしょう。
        QuickPickは、条件を入力しなくても眺めているうちに好みが見えてくる体験を目指しています。
      </p>

      <h2 className="section-heading">1作品ずつ見ながら選ぶ体験を作りたい</h2>
      <p>
        QuickPickでは、画面に1作品だけを大きく表示します。たくさんの情報を一度に比較する
        のではなく、目の前の1つに集中して「これは好きか、そうでないか」をシンプルに判断
        していきます。この積み重ねが、自分の好みを少しずつ明らかにしていきます。
      </p>

      <h2 className="section-heading">スワイプUIを採用した理由</h2>
      <p>
        スワイプは、スマートフォンに最も馴染んだ操作のひとつです。直感的で、片手でも操作でき、
        判断のテンポを崩しません。「考えるより先に手が動く」感覚こそが、QuickPickの目指す
        ストレスのない作品探しに合っていると考え、この形を採用しました。
      </p>

      <h2 className="section-heading">今後の改善予定</h2>
      <p>
        現在はデモ版で、表示しているのは架空のサンプルデータです。今後、提携サービスの正式な
        データが使えるようになった段階で、実際の作品情報を許可された方法で扱い、より役立つ
        作品発見サービスへ改善していく予定です。
      </p>

      <div className="article-footer">
        <button className="cta" onClick={() => onNavigate("article-1")}>
          ← 前の記事
        </button>
        <button className="cta" onClick={() => onNavigate("article-3")}>
          次の記事を読む →
        </button>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// 記事3: 今後の機能
// ─────────────────────────────────────────────────────────────
export function Article3Page({ onNavigate }) {
  return (
    <Page title="正式版で追加したい機能｜お気に入り・履歴・おすすめ改善">
      <p className="article-lead">
        QuickPickはまだデモ版ですが、正式版に向けて追加したい機能はたくさんあります。
        この記事では、今後実装を検討している主な機能を紹介します。
      </p>

      <h2 className="section-heading">お気に入りの整理</h2>
      <p>
        現在も「好き」に入れた作品はタブでまとめて見られますが、正式版ではフォルダ分けや
        並べ替えなど、お気に入りをもっと使いやすく整理できる仕組みを検討しています。
      </p>

      <h2 className="section-heading">閲覧履歴</h2>
      <p>
        一度見た作品を後から振り返れる履歴機能も追加したい機能のひとつです。「あの時スワイプ
        した作品をもう一度見たい」というときに役立つはずです。
      </p>

      <h2 className="section-heading">おすすめの精度向上</h2>
      <p>
        スワイプの履歴から好みの傾向を学び、好きそうな作品を優先的に表示する仕組みを
        改善していきたいと考えています。使うほど自分にフィットしていく作品発見体験を
        目指します。
      </p>

      <p className="page-note">
        これらは現時点での構想であり、提携サービスの承認後、許可された範囲で順次検討・実装して
        いく予定です。
      </p>

      <div className="article-footer">
        <button className="cta" onClick={() => onNavigate("article-2")}>← 前の記事</button>
        <button className="cta cta--primary" onClick={() => onNavigate("home")}>トップへ戻る</button>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// プライバシーポリシー
// ─────────────────────────────────────────────────────────────
export function PrivacyPage() {
  return (
    <Page title="プライバシーポリシー">
      <p>
        QuickPick（以下「当サイト」）は、利用者のプライバシーを尊重し、以下の方針で情報を
        取り扱います。
      </p>

      <h2 className="section-heading">取得する可能性のある情報</h2>
      <p>
        当サイトは、サービス改善や利用状況の把握のために、アクセス情報（ブラウザの種類、
        参照ページ、閲覧日時など）を取得する場合があります。
      </p>

      <h2 className="section-heading">localStorageの利用</h2>
      <p>
        当サイトは、年齢確認の結果やスワイプの選択結果などを、利用者のブラウザ内の
        localStorageに保存します。これらはお使いの端末内に保存されるもので、当サイトの
        サーバーへ自動送信されるものではありません。
      </p>

      <h2 className="section-heading">アクセス解析</h2>
      <p>
        当サイトは将来的に、アクセス解析ツールを利用する場合があります。その際は、本ポリシーを
        更新してお知らせします。
      </p>

      <h2 className="section-heading">広告・アフィリエイト</h2>
      <p>
        当サイトは将来的に、アフィリエイト広告を掲載する可能性があります。詳しくは「広告掲載に
        ついて」のページをご覧ください。
      </p>

      <h2 className="section-heading">第三者提供</h2>
      <p>
        当サイトは、法令に基づく場合を除き、取得した情報を不正に第三者へ提供することはありません。
      </p>

      <h2 className="section-heading">お問い合わせ</h2>
      <p>
        本ポリシーに関するお問い合わせは、「お問い合わせ」ページよりお願いいたします。
      </p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// 利用規約
// ─────────────────────────────────────────────────────────────
export function TermsPage() {
  return (
    <Page title="利用規約">
      <p>
        本利用規約（以下「本規約」）は、QuickPick（以下「当サイト」）の利用条件を定めるものです。
        当サイトを利用された場合、本規約に同意したものとみなします。
      </p>

      <h2 className="section-heading">第1条（年齢制限）</h2>
      <p>当サイトは、18歳未満の方の利用を禁止します。</p>

      <h2 className="section-heading">第2条（デモ版であること）</h2>
      <p>
        当サイトの掲載内容は現在デモ版であり、正式な商品情報ではありません。掲載しているサンプル
        作品は、すべて審査・説明用の架空データです。
      </p>

      <h2 className="section-heading">第3条（情報の正確性）</h2>
      <p>
        当サイトは、掲載情報の正確性・完全性を保証するものではありません。
      </p>

      <h2 className="section-heading">第4条（禁止事項）</h2>
      <p>
        当サイトのコンテンツの無断転載を禁止します。また、当サイトの運営を妨げる不正な利用行為を
        禁止します。
      </p>

      <h2 className="section-heading">第5条（免責事項）</h2>
      <p>
        当サイトの利用によって生じたいかなる損害についても、運営者は責任を負わないものとします。
      </p>

      <h2 className="section-heading">第6条（規約の変更）</h2>
      <p>
        当サイトは、必要に応じて本規約を変更することがあります。変更後の規約は、当サイトに掲載
        した時点で効力を生じます。
      </p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// お問い合わせ
// ─────────────────────────────────────────────────────────────
export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  // Netlify Forms へ送信（SPAなので fetch で application/x-www-form-urlencoded をPOST）
  const handleSubmit = (e) => {
    e.preventDefault();
    setError(false);
    const form = e.target;
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of data.entries()) params.append(k, v);

    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
      .then(() => setSubmitted(true))
      .catch((err) => {
        console.error("[contact] submit error:", err);
        setError(true);
      });
  };

  if (submitted) {
    return (
      <Page title="お問い合わせ">
        <div className="statement-box">
          お問い合わせを送信しました。内容を確認のうえ、順次対応いたします。ありがとうございました。
        </div>
      </Page>
    );
  }

  return (
    <Page title="お問い合わせ">
      <p>
        QuickPickに関するお問い合わせは、以下のフォームよりお願いいたします。いただいた内容には、
        順次対応してまいります。
      </p>

      {error && (
        <p className="page-note" style={{ color: "#ff8080" }}>
          送信に失敗しました。時間をおいて再度お試しください。
        </p>
      )}

      {/* Netlify Forms 対応フォーム（検出用の静的フォームは index.html 側にある）*/}
      <form
        name="contact"
        method="POST"
        data-netlify="true"
        netlify-honeypot="bot-field"
        className="contact-form"
        onSubmit={handleSubmit}
      >
        <input type="hidden" name="form-name" value="contact" />
        <p className="hidden-field">
          <label>記入しないでください: <input name="bot-field" /></label>
        </p>

        <label className="form-label">
          お名前
          <input type="text" name="name" className="form-input" required />
        </label>

        <label className="form-label">
          メールアドレス
          <input type="email" name="email" className="form-input" required />
        </label>

        <label className="form-label">
          お問い合わせ内容
          <textarea name="message" rows={5} className="form-input" required />
        </label>

        <button type="submit" className="cta cta--primary">送信する</button>
      </form>

      <p className="page-note">
        ※ フォームはNetlify Formsを利用しています。送信内容はNetlifyの管理画面から確認できます。
      </p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// 運営者情報
// ─────────────────────────────────────────────────────────────
export function OperatorPage() {
  return (
    <Page title="運営者情報">
      <table className="info-table">
        <tbody>
          <tr><th>運営者</th><td>QuickPick運営者</td></tr>
          <tr><th>サイト名</th><td>QuickPick</td></tr>
          <tr><th>サイト内容</th><td>作品発見サービスの開発・運営</td></tr>
          <tr><th>お問い合わせ</th><td>お問い合わせページから連絡</td></tr>
        </tbody>
      </table>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// 広告掲載について
// ─────────────────────────────────────────────────────────────
export function AdsPage() {
  return (
    <Page title="広告掲載について">
      <p>
        QuickPick（以下「当サイト」）は、将来的にアフィリエイト広告を掲載する可能性があります。
      </p>
      <p>
        広告リンクを経由して商品購入等が行われた場合、運営者が紹介報酬を受け取る場合があります。
      </p>
      <p>
        現在、当サイトはDMM/FANZAの正式な広告素材・商品データを掲載していません。掲載している
        サンプル作品は、すべて審査・説明用の架空データです。
      </p>
      <p>
        アフィリエイトの承認後は、許可された方法でのみ広告リンクや商品情報を掲載する予定です。
      </p>
    </Page>
  );
}
