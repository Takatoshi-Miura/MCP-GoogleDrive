# MCP-GoogleDrive

Model Context Protocol (MCP) を介してGoogle Driveにアクセスするためのサーバーです。

## 機能

- Google Driveのファイル一覧の取得
- Google Driveのファイル検索（ドキュメント、スプレッドシート、スライド対象）
- Google Spreadsheets（スプレッドシート）の閲覧・編集
- Google Docs（ドキュメント）の閲覧・編集
- Google Slides（スライド）の閲覧

## ディレクトリ構造

プロジェクト構造は以下のようになっています：

```
mcp-google-drive/
├── src/
│   ├── config/              # 設定ファイル
│   ├── services/            # ビジネスロジック層
│   │   ├── auth.service.ts      # Google認証サービス
│   │   ├── drive.service.ts     # Google Drive操作
│   │   ├── sheets.service.ts    # Google Sheets操作
│   │   ├── docs.service.ts      # Google Docs操作
│   │   ├── slides.service.ts    # Google Slides操作
│   │   └── pdf.service.ts       # PDF操作
│   ├── tools/               # MCPツール定義
│   │   └── drive.tools.ts       # Drive関連ツール
│   ├── types/               # 型定義
│   │   └── index.ts            # 共通型定義
│   ├── utils/               # ユーティリティ関数
│   │   └── json.ts             # JSON操作ユーティリティ
│   ├── auth-cli.ts          # 認証用CLIスクリプト
│   └── index.ts             # エントリーポイント
├── credentials/             # 認証情報
├── build/                   # ビルド結果
├── package.json
└── tsconfig.json
```


## セットアップ

### 前提条件

- Node.js 18以上
- npm
- Google Cloud Platformのプロジェクトとアクセス権限

### Google APIの設定

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセスし、プロジェクトを作成または選択します。

2. 左側のメニューから「APIとサービス」>「ライブラリ」を選択し、以下のAPIを有効にします：
   - Google Drive API
   - Google Sheets API
   - Google Docs API
   - Google Slides API

3. 左側のメニューから「APIとサービス」>「認証情報」を選択します。

4. 「認証情報を作成」>「OAuthクライアントID」を選択します。
   - アプリケーションの種類として「デスクトップアプリ」を選択
   - 任意の名前を入力し、「作成」をクリックします

5. 作成した認証情報の「JSONをダウンロード」をクリックしてJSONファイルをダウンロードします。

### セットアップ手順

1. リポジトリをクローンする

```bash
git clone https://github.com/yourusername/MCP-GoogleDrive.git
cd MCP-GoogleDrive
```

2. 依存パッケージをインストールする

```bash
cd mcp-google-drive
npm install
```

3. TypeScriptをビルドする

```bash
npm run build
```

4. Google OAuth認証情報ファイルの配置

Google Cloud Consoleからダウンロードした認証情報ファイルを `mcp-google-drive/credentials/client_secret.json` として格納します。

5. 自動認証の実行

```bash
npm run auto-auth
```

**自動認証プロセスの流れ**：
1. **OAuth設定の確認**: 認証情報ファイルが正しく配置されているかチェック
2. **既存トークンの処理**: 古いトークンファイルがある場合は自動削除
3. **ブラウザ認証**: デフォルトブラウザが自動で開き、Google認証ページに移動
4. **権限許可**: Googleアカウントにログインし、アプリケーションへのアクセス許可
5. **トークン保存**: 認証完了後、トークンが `credentials/token.json` に自動保存

**注意事項**：
- ブラウザが自動で開かない場合は、コンソールに表示されるURLを手動でブラウザに貼り付けてください
- 認証が完了すると、コンソールに「✅ 認証が正常に完了しました！」と表示されます

6. mcp.jsonの設定

Cursor SettingsのMCP Serversで「Add new global MCP server」を押下し、mcp.jsonに以下を追記

   ```json
   "mcp-google-drive": {
      "command": "node",
      "args": [
        "[実際のパスを設定する]/MCP-GoogleDrive/mcp-google-drive/build/index.js"
      ]
    }
   ```
以上


## 利用可能なコマンド

プロジェクトでは以下のnpmスクリプトが利用可能です：

- `npm run build` - TypeScriptをコンパイル
- `npm run start` - MCPサーバーを起動
- `npm run auto-auth` - 自動認証を実行
- `npm run check-oauth` - OAuth設定をチェック
- `npm run oauth-info` - OAuth設定の詳細を表示

## 利用可能なツール

このMCPサーバーでは、以下のツールが利用可能です：

### ファイル管理・検索
- `g_drive_list_files_by_type` - 指定したタイプのファイル一覧を取得
- `g_drive_search_files` - Google Drive内のファイルを検索する

### ファイル閲覧
- `g_drive_get_file_structure` - ファイルの構造を取得（タブ一覧、シート一覧）
- `g_drive_read_file` - ファイルの全内容を読み取り（全タブ、全シート、全ページ）
- `g_drive_read_file_part` - ファイルを部分的に読み取り（1タブ、1シート、1ページ単位）
- `g_drive_get_comments` - ファイルのコメントを全取得

### ファイル編集
- `g_drive_insert_value` - ドキュメント、スプレッドシート、スライドに値を挿入（上書きではなく追加）
- `g_drive_create_chart` - 指定されたファイルにグラフを作成（棒グラフ、円グラフ、折れ線グラフ、散布図）
- `g_drive_create_new_element` - 指定されたファイルに新規要素を作成
  - **ドキュメント**: API制限によりタブ作成不可（エラーメッセージを返します）
  - **スプレッドシート**: 新規シートを作成
  - **スライド**: 新規スライドを作成（タイトル付き）

**対応ファイル形式**: Google ドキュメント、Google スプレッドシート、Google スライド、PDF

## 活用事例

### 📖 ファイル内容取得
- **ファイル参照**: 設計書を読取り、AIエージェントによる新機能開発に活用
- **ドキュメント要約**: ファイルの要点を自動抽出・要約生成
- **コメント確認**: レビューやフィードバックの一括取得

### 📊 データ分析・可視化
- **スプレッドシートのデータ分析**: 傾向分析(列の説明があると確実)
- **分析結果の文書化**: 分析結果をドキュメントやスライドに自動出力
- **自動グラフ作成**: データに基づく棒グラフ、円グラフ、折れ線グラフの生成(表はロング形式)

### 🔄 データ変換・連携
- **スプレッドシート → ドキュメント変換**: 表形式データを文書形式に変換
