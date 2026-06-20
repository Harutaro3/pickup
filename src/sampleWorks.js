// ─────────────────────────────────────────────────────────────
// サンプル作品データ（すべて審査・説明用の架空データ）
// 実在の作品・人物・メーカー・商品とは一切関係ありません。
// 動画は ffmpeg で生成した、図形とテキストのみの安全なデモ動画です。
// ─────────────────────────────────────────────────────────────

const NOTICE =
  "この作品・画像・動画は審査説明用の架空データです。実在の作品・人物・商品とは関係ありません。";

export const SAMPLE_WORKS = [
  {
    id: "demo-01",
    title: "サンプル作品01｜大人向けグラビア風デモ",
    genres: ["グラビア風", "大人向け", "架空サンプル"],
    summary: "スワイプで好みの作品を探す体験を説明するための架空サンプルです。",
    description:
      "サンプル作品01は、大人向け作品を直感的に探す体験を示すための架空デモです。" +
      "正式版では、提携サービスから許可された作品情報・サンプル動画を使用する予定です。",
    highlights: ["横画面サンプル動画", "スワイプ判定のデモ", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-landscape-01-v2.mp4",
    sampleType: "video",
    orientation: "landscape",
    notice: NOTICE,
    color: "#1a0a2e", accent: "#e94560", emoji: "🎬",
  },
  {
    id: "demo-02",
    title: "サンプル作品02｜ランジェリー風イメージデモ",
    genres: ["ランジェリー風", "大人向け", "架空サンプル"],
    summary: "雰囲気で作品を選ぶ体験を示すための架空サンプルカードです。",
    description:
      "サンプル作品02は、ジャンルやあらすじだけでは伝わりにくい雰囲気を、" +
      "サンプル動画で確認する流れを説明するための架空デモです。架空データです。",
    highlights: ["横画面サンプル動画", "雰囲気重視", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-landscape-02-v2.mp4",
    sampleType: "video",
    orientation: "landscape",
    notice: NOTICE,
    color: "#0a1a3a", accent: "#533483", emoji: "🎞️",
  },
  {
    id: "demo-03",
    title: "サンプル作品03｜大人向け雰囲気の架空カード",
    genres: ["大人向け", "ムード", "架空サンプル"],
    summary: "落ち着いた大人向けの雰囲気を想定した架空サンプルです。",
    description:
      "サンプル作品03は、落ち着いたトーンの作品を想定した架空のデモカードです。" +
      "正式版では提携サービスの正式なサンプル動画に置き換える予定です。架空データです。",
    highlights: ["横画面サンプル動画", "ムード重視", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-landscape-03-v2.mp4",
    sampleType: "video",
    orientation: "landscape",
    notice: NOTICE,
    color: "#2a0a1a", accent: "#e85d04", emoji: "🌙",
  },
  {
    id: "demo-04",
    title: "サンプル作品04｜グラビア風ショートデモ",
    genres: ["グラビア風", "ショート", "架空サンプル"],
    summary: "短時間でテンポよく確認できる架空サンプルです。",
    description:
      "サンプル作品04は、短いサンプル動画をテンポよくスワイプしていく体験を" +
      "説明するための架空デモです。架空データです。",
    highlights: ["横画面サンプル動画", "短時間", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-landscape-04-v2.mp4",
    sampleType: "video",
    orientation: "landscape",
    notice: NOTICE,
    color: "#0a2a1a", accent: "#40916c", emoji: "⚡",
  },
  {
    id: "demo-05",
    title: "サンプル作品05｜大人向け横画面デモ",
    genres: ["大人向け", "横画面", "架空サンプル"],
    summary: "横画面のサンプル動画表示を確認するための架空カードです。",
    description:
      "サンプル作品05は、横画面のサンプル動画がカード内でどう表示されるかを" +
      "確認するための架空デモです。架空データです。",
    highlights: ["横画面サンプル動画", "表示確認用", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-landscape-05-v2.mp4",
    sampleType: "video",
    orientation: "landscape",
    notice: NOTICE,
    color: "#2a1a00", accent: "#ff6b6b", emoji: "🎥",
  },
  {
    id: "demo-06",
    title: "サンプル作品06｜縦画面グラビア風デモ",
    genres: ["グラビア風", "縦画面", "架空サンプル"],
    summary: "縦画面のサンプル動画表示を確認するための架空カードです。",
    description:
      "サンプル作品06は、スマホ向けの縦画面サンプル動画がどう表示されるかを" +
      "確認するための架空デモです。架空データです。",
    highlights: ["縦画面サンプル動画", "スマホ最適", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-portrait-06-v2.mp4",
    sampleType: "video",
    orientation: "portrait",
    notice: NOTICE,
    color: "#3d1e4a", accent: "#7b7bff", emoji: "📱",
  },
  {
    id: "demo-07",
    title: "サンプル作品07｜縦画面ランジェリー風デモ",
    genres: ["ランジェリー風", "縦画面", "架空サンプル"],
    summary: "縦型サンプルを雰囲気で選ぶ体験を示す架空カードです。",
    description:
      "サンプル作品07は、縦型のサンプル動画を眺めながら直感で選ぶ体験を" +
      "説明するための架空デモです。架空データです。",
    highlights: ["縦画面サンプル動画", "雰囲気重視", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-portrait-07-v2.mp4",
    sampleType: "video",
    orientation: "portrait",
    notice: NOTICE,
    color: "#1a2a4a", accent: "#4f8fff", emoji: "💫",
  },
  {
    id: "demo-08",
    title: "サンプル作品08｜大人向け縦画面デモ",
    genres: ["大人向け", "縦画面", "架空サンプル"],
    summary: "縦画面の大人向け雰囲気を想定した架空カードです。",
    description:
      "サンプル作品08は、縦画面で大人向けの雰囲気を確認するための架空デモです。" +
      "正式版では提携サービスの正式素材に置き換える予定です。架空データです。",
    highlights: ["縦画面サンプル動画", "ムード重視", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-portrait-08-v2.mp4",
    sampleType: "video",
    orientation: "portrait",
    notice: NOTICE,
    color: "#4a1a2a", accent: "#ff4f7b", emoji: "🌹",
  },
  {
    id: "demo-09",
    title: "サンプル作品09｜縦画面ショートデモ",
    genres: ["ショート", "縦画面", "架空サンプル"],
    summary: "縦型ショート動画をテンポよく見る体験の架空カードです。",
    description:
      "サンプル作品09は、縦型のショートなサンプル動画を次々スワイプする体験を" +
      "説明するための架空デモです。架空データです。",
    highlights: ["縦画面サンプル動画", "ショート", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-portrait-09-v2.mp4",
    sampleType: "video",
    orientation: "portrait",
    notice: NOTICE,
    color: "#1a4a2a", accent: "#40ff80", emoji: "🎯",
  },
  {
    id: "demo-10",
    title: "サンプル作品10｜縦画面グラビア風デモ",
    genres: ["グラビア風", "縦画面", "架空サンプル"],
    summary: "縦画面サンプルの表示を確認するための架空カードです。",
    description:
      "サンプル作品10は、縦画面のサンプル動画がカード内で自然に表示されるかを" +
      "確認するための架空デモです。架空データです。",
    highlights: ["縦画面サンプル動画", "表示確認用", "架空データ"],
    durationMin: 6,
    videoSrc: "/samples/demo-portrait-10-v2.mp4",
    sampleType: "video",
    orientation: "portrait",
    notice: NOTICE,
    color: "#4a3a1a", accent: "#ffb84f", emoji: "✨",
  },
];
