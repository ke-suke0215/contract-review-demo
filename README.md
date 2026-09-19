# Contract Review Demo

Bun + Hono + TypeScript で作った契約書レビューのデモアプリです。

## セットアップ

```sh
cp .env.example .env
# .env に OPENAI_API_KEY / TYPESAFE_API_KEY を設定
bun install
bun run dev
```

`http://localhost:3000` を開きます。

## 実装方針

- `src/providers/openai.ts`: OpenAI Responses API 経由の `gpt-5.6-luna` プロバイダー。チェック項目ごとにリクエストを並列実行
- `src/providers/jev.ts`: TypeSafe Jev System One API 経由の `jev-latest` プロバイダー
- `src/review-service.ts`: 共通入力、プロバイダー切り替え、単一／両モデルの並列実行
- `src/config.ts`: 初期スコープの固定チェック項目
- `index.html`: 契約書本文、チェック項目、実行モード、結果表示の画面

## API

`POST /api/review`

```json
{
  "contractText": "# 業務委託契約書...",
  "criteriaIds": ["scope", "payment"],
  "executionMode": "both"
}
```

`executionMode` は `gpt-5.6-luna`、`jev`、`both` のいずれかです。結果は共通の `pass` / `warning` / `fail`、危険度（0〜100）、レイテンシ、利用量に正規化して返します。危険度は「チェック項目を満たしている確率」を `p` としたとき、`(1 - p) × 100` で算出します。

画面で「両方で比較」を選んだ場合は、フロントエンドから各モデル用のAPIリクエストを同時に開始します。レスポンスを受信したモデルの列から順番に比較テーブルを更新します。

レビュー結果は保存しません。契約書本文とチェック項目は画面上のデフォルト値として持ち、ユーザーが編集してリクエストに送信します。
