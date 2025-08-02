# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

このプロジェクトは、Claude Code を通じて Google Drive にアクセスするための MCP (Model Context Protocol) サーバーです。TypeScript で実装され、Google Drive API、Google Sheets API、Google Docs API、Google Slides API と統合して、Claude の会話内でファイル操作を可能にします。

## 必須コマンド

### 開発コマンド
```bash
cd mcp-google-drive
npm run build         # TypeScript を JavaScript にコンパイル (build/ に出力)
npm run start         # MCP サーバーを起動 (事前にビルドが必要)
npm run dev           # 開発用に ts-node で実行

# 認証コマンド
npm run auto-auth     # 自動 OAuth 認証フローを実行
npm run check-oauth   # OAuth 設定状況をチェック
npm run oauth-info    # OAuth 設定の詳細を表示
```

### ビルド要件
- コード変更後は必ず `npm run build` を実行
- TypeScript コンパイラは `build/` ディレクトリに出力
- MCP サーバーは TypeScript ソースではなく、コンパイル済み JavaScript ファイルから実行
- テストコマンドは設定されていない（`npm test` は失敗する）

## アーキテクチャ概要

### サービス層アーキテクチャ
コードベースはサービス指向アーキテクチャに従っています：

- **DriveService**: 全ての Google API 操作を統括、ファイルタイプのルーティングを処理
- **DocsService**: Google Docs 操作（読み取り、書き込み、タブ管理）
- **SheetsService**: Google Sheets 操作（読み取り、書き込み、シート管理）
- **SlidesService**: Google Slides 操作（読み取り、書き込み、スライド管理）
- **PdfService**: PDF ファイル読み取り操作
- **AuthService**: Google OAuth2 認証管理

### MCP ツール登録パターン
全てのツールは `src/tools/drive.tools.ts` で統一された登録関数を使用して登録されます。各ツールは：
- パラメータ検証に Zod を使用
- `common.ts` ユーティリティを通じた一貫したエラーハンドリングを実装
- ファイルタイプに基づいて適切なサービスにルーティング
- 標準化されたレスポンス形式を返却

### 認証フロー
- OAuth2 認証情報は `credentials/client_secret.json` に保存
- アクセストークンは `credentials/token.json` にキャッシュ
- Google Auth Library による自動トークンリフレッシュ
- `auth-cli.ts` による CLI ベースの認証セットアップ

### ファイルタイプ処理
システムは統一されたインターフェースで複数の Google ファイルタイプをサポート：
- **ドキュメント**: タブベースナビゲーション、テキスト挿入、グラフ作成
- **スプレッドシート**: シートベースナビゲーション、データ挿入、グラフ作成
- **プレゼンテーション**: スライドベースナビゲーション、テキスト挿入、グラフリンク
- **PDF**: 読み取り専用コンテンツ抽出

## 重要な実装詳細

### エラーハンドリングパターン
全てのサービスは標準化されたエラーレスポンスを持つ try-catch ブロックを使用：
```typescript
try {
  // API 操作
} catch (error: any) {
  return createErrorResponse("操作が失敗しました", error);
}
```

### ファイル操作アーキテクチャ
- **読み取り操作**: ファイル全体および部分的（タブ/シート/スライド）読み取りをサポート
- **書き込み操作**: データ整合性のため挿入のみ（上書きなし）
- **構造操作**: コンテンツなしでメタデータ（タブ、シート、スライド）を取得
- **作成操作**: 既存ファイルに新要素（シート、スライド）を追加

### Google API 統合
- 全ての Google API 相互作用に `googleapis` npm パッケージを使用
- 全てのサービスに依存性注入として OAuth2Client を渡す
- パフォーマンスのため可能な限りバッチ操作を優先
- 異なる Google ファイル形式の適切な MIME タイプ処理

## 開発ガイドライン

### コード品質要件
- TypeScript strict モードは無効だが、型安全性は依然として重要
- 全ての関数は適切なエラーハンドリングを持つべき
- 一貫した命名：変数/関数は camelCase を使用
- 関数は可能な限り 50 行以下に保つ
- 複雑な操作には JSDoc コメントを追加

### セキュリティ考慮事項
- `credentials/` ディレクトリのファイルは絶対にコミットしない
- API 呼び出し前に全てのユーザー入力を検証
- 適切な OAuth2 スコープを使用（読み取り/書き込み分離）
- 機密データを公開せずにエラーをログ出力

### ファイル構造ルール
- サービスは `src/services/` - Google API ごとに 1 つ
- ツール定義は `src/tools/`
- 型定義は `src/types/`
- ユーティリティ関数は `src/utils/`
- 認証ロジックは `src/services/auth.service.ts` に保持

## 重要な注意事項

- プロジェクトは ES モジュールを使用（package.json で `"type": "module"`）
- ビルド出力は `dist/` ではなく `build/` ディレクトリ
- テストフレームワークは現在設定されていない
- MCP サーバーは stdio トランスポート経由で通信
- 全ての操作は実行前に有効な Google 認証が必要