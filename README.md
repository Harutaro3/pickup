# EroPick

成人向け動画サンプルをスワイプ形式で流し見できる、作品発見サービスの開発中プロジェクトです。

> **⚠️ 注意**
> 本サービスは**18歳以上の方専用**です。18歳未満の方はご利用いただけません。
> 本サービスはFANZA公式サービスではありません。

---

## 概要

- FANZAアフィリエイトAPIからサンプル動画情報を取得し、カード形式で表示
- 右スワイプ（好き）/ 左スワイプ（嫌い）で直感的に作品を選別
- 好き/嫌いの判定履歴をlocalStorageに保存
- 同じメーカー・シリーズ・女優が連続しにくい `diverse` 並び替え
- 収益化OFF設計（通常リンクのみ使用）

---

## 技術スタック

| 用途 | 技術 |
|---|---|
| フロントエンド | React + Vite |
| バックエンド（ローカル） | Node.js / Express |
| バックエンド（本番） | Netlify Functions |
| スタイリング | CSS（バニラ） |

---

## ローカル起動

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
# Windows PowerShell
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

`.env` を開いて実際の値を入力してください。

```
DMM_API_ID=取得したAPI ID
DMM_AFFILIATE_ID=取得したアフィリエイトID
```

> **重要**: APIキーはDMMアフィリエイトサイト（https://affiliate.dmm.com）で取得してください。
> `.env` は絶対にGitにコミットしないでください（`.gitignore` で除外済み）。

### 3. 起動

```bash
npm run dev:all
```

ブラウザで `http://localhost:5173` を開いてください。

---

## APIキーなしで動かす（モックモード）

`.env` の以下を `true` にするとダミーデータで動作確認できます。

```
USE_MOCK_FANZA=true
```

---

## 収益化設定について

現在は収益化OFFで運用しています。

```
MONETIZATION_ENABLED=false
OUTBOUND_LINK_MODE=normal
```

この設定では：

- `outboundURL` は必ず `normalURL`（通常の商品ページ）になります
- `affiliateURL` はデータとして保持しますが、画面には表示しません
- 詳細リンクの文言は「詳細を見る」です
- 「購入」「今すぐ買う」などの購買促進文言は使いません

---

## Netlifyへの公開

### 事前に確認

```bash
git status  # .env が含まれていないことを確認
```

### Netlify側の設定

1. NetlifyでGitHubリポジトリを連携
2. ビルド設定：
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
3. Environment Variables に以下を設定（`DMM_API_ID` と `DMM_AFFILIATE_ID` は実値）：

```
DMM_API_ID=（実際のAPI ID）
DMM_AFFILIATE_ID=（実際のアフィリエイトID）
USE_MOCK_FANZA=false
MONETIZATION_ENABLED=false
OUTBOUND_LINK_MODE=normal
FANZA_SITE=FANZA
FANZA_SERVICE=digital
FANZA_FLOOR=videoa
FANZA_SORT=date
EXCLUDE_FREE_ITEMS=true
MAX_FETCH_PAGES=3
FANZA_RANDOM_OFFSET=true
FANZA_RANDOM_OFFSET_MAX=5000
FEED_ORDER_MODE=diverse
DIVERSE_LOOKBACK=6
```

---

## 注意事項

- 本サービスは開発中です
- 本サービスはFANZA公式サービスではありません
- 提携サービスから許可された商品情報・サンプル動画情報を利用しています
- 現在は収益化OFFで運用しており、詳細リンクは通常の商品ページURLを使用しています
- 18歳未満の方は利用できません

---

## ライセンス

個人開発プロジェクトです。
