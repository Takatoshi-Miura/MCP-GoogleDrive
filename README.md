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
│   ├── auth.ts              # Google認証処理
│   ├── generate-token.ts    # 認証トークン生成
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

### インストール手順

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

### セットアップ方法

1. 認証用JSONファイルを `mcp-google-drive/credentials/client_secret.json` として格納します。

2. client_secret.jsonをcredentialsディレクトリに配置後、以下のコマンドでトークンを生成:
   ```
   cd mcp-google-drive
   node build/generate-token.js
   ```
   - このコマンドを実行すると、認証URLが表示されます
   - 認証用URLをブラウザで開き、Google認証を行います
   - 認証後、リダイレクトされたURLからcode=の後ろの部分をコピーし、コンソールに貼り付けます
   - 「トークンが正常に保存されました」と表示されれば認証は成功です

3. Cursor SettingsのMCP Serversで「Add new global MCP server」を押下し、mcp.jsonに以下を追記
   ```json
   "mcp-google-drive": {
      "command": "node",
      "args": [
        "[実際のパスを設定する]/MCP-GoogleDrive/mcp-google-drive/build/index.js"
      ]
    }
   ```
   以上

## 利用可能なツール

このMCPサーバーでは、以下のツールが利用可能です：

### ファイル管理・検索
- `g_drive_list_files_by_type` - 指定したタイプのファイル一覧を取得
- `g_drive_search_files_with_analysis` - ファイルを検索し、内容を分析して関連度順に並び替え

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
