# MCP-GoogleDrive

Model Context Protocol (MCP) を介してGoogle Driveにアクセスするためのサーバーです。

## 機能

- Google Driveのファイル一覧の取得
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
│   │   ├── drive.tools.ts       # Drive関連ツール
│   │   ├── sheets.tools.ts      # Sheets関連ツール
│   │   ├── docs.tools.ts        # Docs関連ツール
│   │   ├── slides.tools.ts      # Slides関連ツール
│   │   └── pdf.tools.ts         # PDF関連ツール
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

### Google Drive関連

1. `g_drive_list_files_by_type` - Googleドライブファイル一覧を取得(種別：'all', 'sheets', 'docs', 'presentations', 'pdf')

### スプレッドシート関連

2. `g_drive_get_spreadsheet_sheets` - スプレッドシートのシート一覧を取得
3. `g_drive_get_all_sheets_data` - スプレッドシートの全シートデータを一括取得
4. `g_drive_get_spreadsheet_text` - スプレッドシートの全シートのテキストデータを取得
5. `g_drive_get_spreadsheet_comments` - スプレッドシートの全シートのコメントを取得
6. `g_drive_get_sheet_values` - スプレッドシートから値を取得(範囲指定)
7. `g_drive_update_sheet_values` - スプレッドシートの値を更新
8. `g_drive_append_sheet_values` - スプレッドシートに値を追加

### ドキュメント関連

9. `g_drive_get_doc_tabs` - Googleドキュメントのタブ一覧を取得する
10. `g_drive_get_doc_content` - Googleドキュメントの内容を全取得(タブ考慮)
11. `g_drive_get_doc_tab_text` - Googleドキュメントの内容を取得(タブID指定)
12. `g_drive_get_doc_comments` - Googleドキュメントのコメントを取得する
13. `g_drive_insert_text_to_doc` - Googleドキュメントに指定位置にテキストを挿入
14. `g_drive_replace_text_in_doc` - Googleドキュメント内のテキストを置換

### スライド関連

15. `g_drive_get_presentation_text` - Googleスライドに含まれるテキストデータのみを取得
16. `g_drive_get_slide_by_page_number` - Googleスライドの特定ページを番号指定で取得
17. `g_drive_get_presentation_comments` - Googleスライドのコメントを取得

### PDF関連

18. `g_drive_extract_pdf_text` - GoogleドライブのPDFファイルからテキスト情報を抽出
