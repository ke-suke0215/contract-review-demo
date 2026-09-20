# AGENTS.md

## プロジェクト概要

Bun + Hono + TypeScript で構成された契約書レビューのデモアプリ。`index.html` がUI、`src/index.ts` がAPIサーバーのエントリポイントです。レビュー結果は保存しません。

## 開発コマンド

```sh
cp .env.example .env   # 初回のみ。必要なAPIキーを設定
bun install
bun run dev            # 開発サーバー（ホットリロード）
bun run start          # 通常起動
bun run typecheck      # TypeScript検査
```

テスト用スクリプトは未定義です。変更後は少なくとも `bun run typecheck` を実行し、APIキーを設定できる場合は `http://localhost:3000` からレビューを手動確認します。

## 構成

- `src/index.ts`: Honoアプリ、`/api/health`・`/api/criteria`・`/api/review`、静的HTML配信
- `src/config.ts`: レビュー対象のチェック項目とJEVモデル設定
- `src/review-service.ts`: 入力準備、条文抽出、プロバイダー選択・実行、エラーの結果化
- `src/clauses.ts`: Markdownの`##`見出し単位で条文を抽出
- `src/review-types.ts`: 共通の型・APIレスポンス形式
- `src/providers/provider.ts`: 判定結果の共通変換（`pass`/`warning`/`fail`、危険度）
- `src/providers/openai.ts`: OpenAI Responses API。チェック項目ごとに並列実行し、構造化JSONを取得
- `src/providers/jev.ts`: TypeSafe Jev System One API。判定と根拠条文選択を取得
- `index.html`: インラインCSS/JavaScriptを含む契約書エディタ兼結果比較UI

## 環境変数

- `OPENAI_API_KEY`: `gpt-5.6-luna` 利用時に必要
- `TYPESAFE_API_KEY`: `jev` 利用時に必要
- `PORT`: 任意、既定値 `3000`
- `JEV_MODEL`: 任意、既定値 `jev-latest`
- `TYPESAFE_API_URL`: 任意、既定値 `https://api.typesafe.ai/v1/systemone`

`.env` やAPIキーをコミットしないでください。

## APIと処理上の注意

- `POST /api/review` の入力は `contractText`, `criteriaIds`, `executionMode`。実行モードは `jev`、`gpt-5.6-luna`、`both`。
- `criteriaIds` は `CHECK_CRITERIA` に存在するIDだけが処理対象になります。未選択の場合はエラーです。
- `both` ではプロバイダーを並列実行し、一方の失敗をもう一方の結果と分離して返します。UIもモデルごとにリクエストを並列開始します。
- 判定確率は `0.8以上=pass`、`0.5以上=warning`、それ未満=`fail`。危険度は `(1 - probability) * 100` です。
- リクエスト本文の上限は1 MiB、外部API呼び出しのタイムアウトは60秒です。
- 契約書本文は推測で補完せず、根拠条文IDを共通形式に変換して返します。APIキーはサーバー側だけで扱います。

## 変更時のルール

- チェック項目を追加・削除・変更するときは、`src/config.ts` と `index.html` のチェックボックスおよび表示文言を両方更新する。UIは `/api/criteria` を自動取得していません。
- 新しいプロバイダーは `ReviewProvider` と `ProviderReviewResult` の形式に合わせ、`src/review-service.ts` のプロバイダーマップと型定義も更新する。
- 外部APIのレスポンスは各プロバイダー内で検証・正規化し、UIにプロバイダー固有の形式を持ち込まない。
- `index.html` の結果描画に外部入力を埋め込む場合は、既存の `escapeHtml` を必ず通す。
- 既存の作業ツリー変更を上書きせず、依存関係を変更した場合は `bun.lock` も更新する。
