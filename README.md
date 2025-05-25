# MCP-GoogleDrive

Model Context Protocol (MCP) を介してGoogle Driveにアクセスするためのサーバーです。

## 機能

- Google Driveのファイル一覧の取得
- Google Spreadsheets（スプレッドシート）の閲覧・編集
- Google Docs（ドキュメント）の閲覧・編集
- Google Slides（スライド）の閲覧

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

1. `g_drive_list_files` - Googleドライブのファイル一覧を取得
2. `g_drive_list_sheets` - Googleドライブ内のスプレッドシート一覧を取得
3. `g_drive_list_docs` - Googleドライブ内のドキュメント一覧を取得
4. `g_drive_list_presentations` - Googleドライブ内のスライド一覧を取得

### スプレッドシート関連

5. `g_drive_get_sheet_values` - スプレッドシートから値を取得
6. `g_drive_update_sheet_values` - スプレッドシートの値を更新
7. `g_drive_append_sheet_values` - スプレッドシートに値を追加
8. `g_drive_get_spreadsheet_sheets` - スプレッドシートのシート一覧を取得
9. `g_drive_get_all_sheets_data` - スプレッドシートの全シートデータを一括取得
10. `g_drive_get_spreadsheet_text` - スプレッドシートに含まれるテキストデータのみを取得（要約用）

### ドキュメント関連

11. `g_drive_get_doc_content` - Googleドキュメントの内容を取得
12. `g_drive_insert_text_to_doc` - Googleドキュメントに指定位置にテキストを挿入
13. `g_drive_replace_text_in_doc` - Googleドキュメント内のテキストを置換
14. `g_drive_get_doc_text` - Googleドキュメントに含まれるテキストデータのみを取得（要約用）
15. `g_drive_get_doc_tab_text` - GoogleドキュメントのタブIDを指定してテキスト内容を取得。
16. `g_drive_get_doc_tabs` - Googleドキュメントのタブ一覧を取得する

### スライド関連

17. `g_drive_get_presentation_content` - Googleスライドの内容を取得
18. `g_drive_get_slide_thumbnail` - Googleスライドの特定ページのサムネイル画像を取得
19. `g_drive_get_slide_by_page_number` - Googleスライドの特定ページを番号指定で取得
20. `g_drive_get_presentation_comments` - Googleスライドのコメントを取得
21. `g_drive_get_presentation_text` - Googleスライドに含まれるテキストデータのみを取得（要約用）


