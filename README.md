# MCP-GoogleDrive

Model Context Protocol (MCP) を介してGoogle Driveにアクセスするための**SSE（Server-Sent Events）専用MCPサーバー**です。
HTTPベースのリアルタイム通信でGoogle Drive APIへのアクセスを提供します。

## 特徴

- 📡 **SSE専用**: Server-Sent Events（SSE）によるHTTPベースのリアルタイム通信
- 🌐 **リモートデプロイ対応**: Google Cloud Runなどのクラウド環境での運用が可能
- 🔒 **多様な認証方式**: OIDC IDトークン認証（環境変数）、Service Account認証をサポート
- 🚀 **高性能**: 非同期処理による高速なAPI応答
- 🛠️ **デバッグ容易**: 詳細なログ出力とエラーハンドリング
- 🔧 **Headers不要**: 環境変数によるOIDC認証でMCPクライアントのheaders設定が不要

## 機能

- Google Driveのファイル一覧の取得
- Google Driveのファイル検索（ドキュメント、スプレッドシート、スライド対象）
- Google Spreadsheets（スプレッドシート）の閲覧・編集
- Google Docs（ドキュメント）の閲覧・編集
- Google Slides（スライド）の閲覧

## エンドポイント

SSE専用MCPサーバーでは、以下のエンドポイントを提供します：

- **`GET /`** - サーバー情報とエンドポイント一覧
- **`GET /health`** - ヘルスチェック
- **`GET /mcp`** - SSE接続の確立（Model Context Protocol通信用）
- **`POST /messages?sessionId=<id>`** - MCPメッセージの送信

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

6. サーバーの起動

```bash
npm run start
```

サーバーが起動すると、以下のような出力が表示されます：

```
🚀 MCP Google Drive Server (SSE専用) を起動中...
✅ MCP Google Drive Server (SSE) が起動しました
🌐 ポート: 8080
🔧 環境: Local
📡 SSEエンドポイント: http://localhost:8080/mcp
💬 メッセージエンドポイント: http://localhost:8080/messages
🏥 ヘルスチェック: http://localhost:8080/health
```

## 認証方式

このMCPサーバーは複数の認証方式をサポートしています：

### 1. OIDC ID Token認証（推奨・Headers不要）

環境変数でOIDC ID Tokenを設定することで、MCPクライアントのheaders設定なしで認証できます。

#### 設定方法

```bash
# 環境変数を設定
export GOOGLE_OIDC_TOKEN="your-oidc-id-token"
# または
export MCP_GOOGLE_OIDC_TOKEN="your-oidc-id-token"

# サーバー起動
npm start
```

#### OIDC ID Tokenの取得方法

**Google Cloud SDK使用:**
```bash
gcloud auth print-identity-token
```

**Node.js使用:**
```javascript
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth();
const client = await auth.getIdTokenClient('https://your-service-url');
const token = await client.idTokenProvider.fetchIdToken('https://your-service-url');
```

**Python使用:**
```python
from google.auth.transport.requests import Request
from google.oauth2 import id_token
import google.auth

credentials, project = google.auth.default()
request = Request()
token = id_token.fetch_id_token(request, 'https://your-service-url')
```

#### OIDC設定の確認

```bash
npm run check-oidc
```

### 2. OAuth2認証（ローカル開発用）

従来のOAuth2フローを使用した認証方式です。

```bash
npm run auto-auth
```

### 3. Service Account認証（Cloud Run用）

Google Cloud Run環境では自動的にService Account認証が使用されます。

## MCPクライアントでの設定

### ローカル実行の場合

```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

### Cursor用設定（推奨）

**注意**: CursorはSSE形式のMCPサーバーでheadersをサポートしていないため、`supergateway`を使用してSSE→stdio変換を行います。

   ```json
{
  "mcpServers": {
   "mcp-google-drive": {
      "command": "npx",
      "args": [
        "-y",
        "supergateway",
        "--sse",
        "https://mcp-google-drive-1032995804784.asia-northeast1.run.app/mcp",
        "--header",
        "Authorization:Bearer YOUR_ID_TOKEN"
      ]
    }
  }
}
```

#### トークンの更新

IDトークンは約1時間で期限切れになるため、以下のスクリプトで更新してください：

```bash
# トークンを更新
./update-supergateway-token.sh

# 設定ファイルをCursorにインポート
# 設定 > MCP Servers > Import from file > cursor-mcp-stdio-proxy.json
```

### 他のMCPクライアント（VS Code等）

```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://mcp-google-drive-1032995804784.asia-northeast1.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ID_TOKEN"
      }
    }
  }
}
```

## リモートデプロイ

### Google Cloud Runへのソースデプロイ（OIDC IDトークン認証）

#### 1. デプロイ手順

```bash
# Google Cloud CLIがインストールされていることを確認
gcloud version

# プロジェクトを設定
gcloud config set project YOUR_PROJECT_ID

# ユーザーアカウントでログイン（API有効化のため）
gcloud auth login

# 必要なAPIを有効化
gcloud services enable run.googleapis.com drive.googleapis.com sheets.googleapis.com docs.googleapis.com slides.googleapis.com

# 認証付きでソースからデプロイ
gcloud run deploy mcp-google-drive \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --no-allow-unauthenticated \
  --set-env-vars MCP_TRANSPORT=http \
  --port 8080

# サービスアカウントを確認
gcloud run services describe mcp-google-drive \
   --region=asia-northeast1 \
   --format="value(spec.template.spec.serviceAccountName)"

# サービスアカウントに必要な権限を付与
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
   --member="serviceAccount:[上記で確認したサービスアカウント]" \
   --role="roles/iam.serviceAccountTokenCreator"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
   --member="serviceAccount:[上記で確認したサービスアカウント]" \
   --role="roles/run.viewer"
```

#### 2. IDトークン取得手順

```bash
# サービスアカウントキーを作成（一時的に使用）
gcloud iam service-accounts keys create temp-service-account-key.json \
  --iam-account=[上記で確認したサービスアカウント]

# サービスアカウントでログイン
gcloud auth activate-service-account --key-file=temp-service-account-key.json

# IDトークンを取得
gcloud auth print-identity-token --audiences=https://YOUR_CLOUD_RUN_URL

# セキュリティのためキーファイルを削除
rm temp-service-account-key.json
```

#### 3. MCPクライアント設定

```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://YOUR_CLOUD_RUN_URL/mcp",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_ID_TOKEN"
      }
    }
  }
}
```

#### 4. トークン更新手順

**IDトークンは約1時間で期限切れになります。**更新が必要な場合：

```bash
# 現在のサービスアカウントでIDトークンを再取得
gcloud auth print-identity-token --audiences=https://YOUR_CLOUD_RUN_URL

# または、サービスアカウントキーから再取得
gcloud iam service-accounts keys create temp-key.json --iam-account=[サービスアカウント]
gcloud auth activate-service-account --key-file=temp-key.json
gcloud auth print-identity-token --audiences=https://YOUR_CLOUD_RUN_URL
rm temp-key.json
```

**自動化スクリプト例**:
```bash
#!/bin/bash
# token-refresh.sh
SERVICE_ACCOUNT="[あなたのサービスアカウント]"
AUDIENCE="https://[あなたのCloud Run URL]"

gcloud iam service-accounts keys create temp-key.json --iam-account=$SERVICE_ACCOUNT
gcloud auth activate-service-account --key-file=temp-key.json
TOKEN=$(gcloud auth print-identity-token --audiences=$AUDIENCE)
echo "New Token: $TOKEN"
rm temp-key.json
```

### その他のクラウド環境

**Heroku、Railway、Vercel等**:

1. **環境変数の設定**:
   ```bash
   MCP_TRANSPORT=http
   PORT=8080  # または各プラットフォーム指定のポート
   ```

2. **デプロイ後のmcp.json設定**:
   ```json
   {
     "mcpServers": {
       "mcp-google-drive": {
         "url": "https://your-deployed-app.run.app/mcp",
         "transport": "sse"
       }
     }
   }
   ```

## 利用可能なコマンド

プロジェクトでは以下のnpmスクリプトが利用可能です：

### ビルド・認証
- `npm run build` - TypeScriptをコンパイル
- `npm run auto-auth` - 自動認証を実行
- `npm run check-oauth` - OAuth設定をチェック
- `npm run oauth-info` - OAuth設定の詳細を表示

### サーバー起動
- `npm run start` - MCPサーバーを起動（SSE専用）
- `npm run dev` - 開発モード（SSE専用）

### 環境変数
- `PORT` - サーバーのポート番号（デフォルト: 8080）
- `NODE_ENV` - 実行環境（production/development）

## トラブルシューティング

### Cursorでツールが認識されない場合

1. **supergateway方式を使用**（推奨）
   ```bash
   ./update-supergateway-token.sh
   ```
   生成された`cursor-mcp-stdio-proxy.json`をCursorにインポート

2. **IDトークンの期限切れ**
   - IDトークンは約1時間で期限切れになります
   - `./update-supergateway-token.sh`を実行して更新

3. **npm/npxが見つからない場合**
   - Node.jsがインストールされていることを確認
   - `which npx`でパスを確認し、フルパスを設定に使用

### Cloud Runサーバーの問題

1. **認証エラー（403 Forbidden）**
   ```bash
   # 認証状態を確認
   gcloud auth list
   
   # 必要に応じて再認証
   gcloud auth login
   ```

2. **サーバーの動作確認**
   ```bash
   # ヘルスチェック
   TOKEN=$(gcloud auth print-identity-token)
   curl -H "Authorization: Bearer $TOKEN" \
        https://mcp-google-drive-1032995804784.asia-northeast1.run.app/health
   ```

3. **デプロイの更新**
   ```bash
   # 最新コードをデプロイ
   gcloud run deploy mcp-google-drive \
     --source . \
     --region=asia-northeast1 \
     --platform=managed \
     --port=8080
   ```

### Google Drive API認証

1. **OAuth認証の確認**
   ```bash
   npm run check-oauth
   ```

2. **認証の再実行**
   ```bash
   npm run auto-auth
   ```

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
