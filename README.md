## English version

# Perplexity Bun / TypeScript client

This repository provides a lightweight TypeScript client for the public Perplexity.ai SSE endpoint. It is primarily intended for use with the Bun runtime but also works with Node.js.

## Key points

- Includes utilities to receive and parse SSE (Server-Sent Events).
- Offers a synchronous-style `PerplexityClient` and an async-initializing wrapper `PerplexityAsyncClient` (`src/perplexity_async.ts`).

## Quick start

1. Install dependencies (this project assumes a `package.json` is present):

```bash
# With Bun
bun install

# Or with npm
npm install
```

2. Run a sample (Bun recommended):

```bash
# Run a sample directly with Bun
bun run sample/index.ts

# Or build and run with Node
npm run build
node ./dist/sample/index.js
```

The `sample/` folder contains example scripts (`sample/index.ts`, `sample/stream.ts`, `sample/followup.ts`, `sample/probe_models.ts`).

## Main files

- `src/perplexity.ts` - Core client (SSE parsing, etc.)
- `src/perplexity_async.ts` - Async initialization wrapper
- `src/labs.ts` - Client for Labs (e.g. Socket.IO)
- `src/emailnator.ts` - Temporary email helper
- `src/driver.ts` - Browser automation stub
- `src/search_helpers.ts`, `src/types.ts` - Utilities and type definitions

## Notes

- By default the client makes anonymous (unauthenticated) requests to the public endpoint. For production use, configure cookies or tokens appropriately.
- Network access is required (Perplexity API and related resources).
- SSE streaming may be interrupted; implement reconnection and partial-receive handling in application code.

## Development / Quality gates

- Types live in `src/types.ts`. Run type checks when updating public types.
- After changes, build and run the provided samples to verify behavior.

## License

MIT

---

## 具体的なコード例 (日本語)

簡単な非ストリーミング検索の例（`sample/index.ts` を参照）:

```ts
import { PerplexityClient } from "./src/perplexity";

async function main() {
  const cli = new PerplexityClient();

  // 非ストリーミング：最終的な集約レスポンスを取得
  const result = await cli.search(
    "今日のニュース",
    "pro",
    "claude37sonnetthinking",
    ["web", "social"],
    {},
    "ja-JP"
  );

  console.log("blocks length:", result.blocks?.length ?? 0);
  // ブロックを走査して安全に中身を取り出す
  for (const block of result.blocks ?? []) {
    console.log(block.intended_usage, block);
  }
}

main().catch(console.error);
```

ストリーミング（逐次受信）利用の例（`sample/stream.ts` を参照）:

```ts
import { PerplexityClient } from "./src/perplexity";

async function main() {
  const cli = new PerplexityClient();
  const gen = await cli.asyncSearch(
    "きょうのニュース",
    "auto",
    null,
    ["web"],
    {},
    "ja-JP"
  );

  for await (const chunk of gen) {
    // チャンクを逐次処理
    console.log(chunk);
  }
}

main().catch(console.error);
```

## Concrete code examples (English)

Non-streaming example (see `sample/index.ts`):

```ts
import { PerplexityClient } from "./src/perplexity";

async function main() {
  const cli = new PerplexityClient();
  // Non-streaming: get final aggregated response
  const result = await cli.search(
    "today news",
    "pro",
    "claude37sonnetthinking",
    ["web", "social"],
    {},
    "en-US"
  );

  console.log("blocks length:", result.blocks?.length ?? 0);
  for (const block of result.blocks ?? []) {
    console.log(block.intended_usage, block);
  }
}

main().catch(console.error);
```

Streaming example (see `sample/stream.ts`):

```ts
import { PerplexityClient } from "./src/perplexity";

async function main() {
  const cli = new PerplexityClient();
  const gen = await cli.asyncSearch(
    "today news",
    "auto",
    null,
    ["web"],
    {},
    "en-US"
  );

  for await (const chunk of gen) {
    console.log(chunk);
  }
}

main().catch(console.error);
```

# Perplexity Bun / TypeScript クライアント

このリポジトリは Perplexity.ai の公開 SSE エンドポイントを扱う、軽量な TypeScript クライアント実装です。
主に Bun ランタイムでの利用を想定していますが、Node でも動作します。

## 主要なポイント

- SSE（Server-Sent Events）を受け取りパースするユーティリティを含みます。
- 同期スタイルの `PerplexityClient` と、非同期初期化用の `PerplexityAsyncClient`（`src/perplexity_async.ts`）を提供します。

## 使い方（ざっくり）

1. 依存関係をインストール（プロジェクトに package.json がある想定）:

```bash
# Bun を使う場合
bun install

# あるいは npm を使う場合
npm install
```

2. サンプル実行（Bun 推奨）:

```bash
# 直接サンプルを実行する例（Bun）
bun run sample/index.ts

# または事前にビルドして Node で実行する例
npm run build
node ./dist/sample/index.js
```

※ このリポジトリには `sample/` にサンプルスクリプトが含まれています（`sample/index.ts`, `sample/stream.ts`, `sample/followup.ts`, `sample/probe_models.ts`）。

## 主要ファイル

- `src/perplexity.ts` - 基本クライアント（SSE パース等）
- `src/perplexity_async.ts` - 非同期初期化ラッパー
- `src/labs.ts` - Labs（Socket.IO 等）向けクライアント
- `src/emailnator.ts` - 一時メール取得ユーティリティ
- `src/driver.ts` - ブラウザ自動化用スタブ
- `src/search_helpers.ts`, `src/types.ts` - ユーティリティと型定義

## 注意事項

- デフォルトでは匿名（未認証）で公開エンドポイントにアクセスします。実運用ではクッキーやトークンによる認証を適切に設定してください。
- ネットワークアクセスが必要です（Perplexity の API および関連リソース）。
- SSE のストリーミングは途中で中断されることがあるため、アプリ側で再接続や部分受信のハンドリングを用意してください。

## 開発／品質ゲート

- 型定義は `src/types.ts` にまとめられています。変更時は型チェックを推奨します。
- 変更を加えたらビルドと簡単なサンプル実行で動作確認してください。

## ライセンス

MIT

---
