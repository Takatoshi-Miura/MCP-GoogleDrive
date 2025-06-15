# MCP-GoogleDrive

Model Context Protocol (MCP) を介してGoogle Driveにアクセスするための**SSE（Server-Sent Events）専用MCPサーバー**です。
HTTPベースのリアルタイム通信でGoogle Drive APIへのアクセスを提供します。

## 特徴

- 📡 **SSE専用**: Server-Sent Events（SSE）によるHTTPベースのリアルタイム通信
- 🌐 **リモートデプロイ対応**: Google Cloud Runなどのクラウド環境での運用が可能
- 🔥 **Firebase認証対応**: Firebase AuthenticationによるセキュアなIDトークン認証（推奨）
- 🔒 **多様な認証方式**: Firebase認証、OIDC IDトークン認証、Service Account認証をサポート
- 🚀 **高性能**: 非同期処理による高速なAPI応答
- 🛠️ **デバッグ容易**: 詳細なログ出力とエラーハンドリング
- 📱 **モバイル対応**: CursorやモバイルアプリでのFirebase認証に最適化

## 機能

- Google Driveのファイル一覧の取得
- Google Driveのファイル検索（ドキュメント、スプレッドシート、スライド対象）
- Google Spreadsheets（スプレッドシート）の閲覧・編集
- Google Docs（ドキュメント）の閲覧・編集
- Google Slides（スライド）の閲覧・編集

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
- Firebase プロジェクト（推奨）
- Google Cloud Platformのプロジェクトとアクセス権限

### 認証方式の選択

このMCPサーバーは3つの認証方式をサポートしています：

1. **🔥 Firebase認証（推奨）** - Cursorやモバイルアプリでの利用に最適
2. **🔐 OAuth認証** - ローカル開発用の従来認証
3. **🌐 OIDC認証** - Cloud Run環境用

**推奨**: 本番環境での利用にはFirebase認証を使用してください。

### Firebase認証の設定（推奨）

#### 1. Firebase プロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 「プロジェクトを作成」または既存のプロジェクトを選択
3. Authentication を有効化
4. Sign-in method で使用したい認証方式を設定（Email/Password、Google、など）

#### 2. Google Drive API の有効化

1. [Google Cloud Console](https://console.cloud.google.com/)で同じプロジェクトを選択
2. 「APIとサービス」>「ライブラリ」で以下のAPIを有効化：
   - Google Drive API
   - Google Sheets API
   - Google Docs API
   - Google Slides API

#### 3. Firebase サービスアカウントキーの生成

1. Firebase Console > プロジェクトの設定 > サービス アカウント
2. 「新しい秘密鍵の生成」をクリック
3. JSONファイルをダウンロード
4. `credentials/firebase-service-account.json` として保存

#### 4. サービスアカウント権限の設定

```bash
# Firebase サービスアカウントにGoogle Drive API権限を付与
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:firebase-adminsdk-xxxxx@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/drive.file"
```

### 従来のGoogle OAuth設定（ローカル開発用）

#### OAuth クライアントIDの作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 「APIとサービス」>「認証情報」を選択
3. 「認証情報を作成」>「OAuthクライアントID」を選択
4. アプリケーションの種類として「デスクトップアプリ」を選択
5. 作成した認証情報のJSONをダウンロードし、`credentials/client_secret.json`として保存

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

#### Firebase認証を使用する場合（推奨）

4. Firebase設定の確認

```bash
npm run check-firebase
```

5. サービスアカウントファイルの配置

Firebase ConsoleからダウンロードしたサービスアカウントJSONファイルを `mcp-google-drive/credentials/firebase-service-account.json` として配置します。

6. サーバーの起動

```bash
npm run start
```

#### OAuth認証を使用する場合（ローカル開発）

4. OAuth認証情報ファイルの配置

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

## 認証方式

このMCPサーバーは複数の認証方式をサポートしています：

### 1. Firebase認証（推奨）

Firebase AuthenticationのIDトークンを使用したセキュアな認証方式です。

#### 特徴
- 🔥 **セキュア**: Firebase Admin SDKによる厳密なトークン検証
- 📱 **モバイル対応**: React Native、Flutter等のモバイルアプリに最適
- 🌐 **スケーラブル**: Cloud Run等のクラウド環境での本番利用に適している
- 👥 **ユーザー管理**: Firebase Consoleでユーザー管理が可能

### 2. OIDC ID Token認証（Cloud Run環境用）

環境変数でOIDC ID Tokenを設定する認証方式です。

```bash
# 環境変数を設定
export GOOGLE_OIDC_TOKEN="your-oidc-id-token"
npm start
```

### 3. OAuth2認証（ローカル開発用）

従来のOAuth2フローを使用した認証方式です。

```bash
npm run auto-auth
```

## MCPクライアントでの設定

### Firebase認証を使用する場合（推奨）

#### 🚀 Cursor用設定（推奨：クエリパラメータ認証）

**最新の推奨方法**: クエリパラメータでFirebase IDトークンを送信

```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://mcp-google-drive-firebase-1032995804784.asia-northeast1.run.app/mcp?token=YOUR_FIREBASE_ID_TOKEN"
    }
  }
}
```

**特徴**:
- ✅ **supergateway不要** - CursorがSSE形式MCPサーバーをネイティブサポート
- ✅ **シンプル** - 複雑な変換プロセスが不要
- ✅ **セキュア** - Firebase認証でアクセス制御
- ✅ **高速** - 余分なプロキシ処理がないため高速

#### Firebase IDトークン取得

**Node.js/JavaScript用スクリプト**:
```bash
# mcp-google-driveディレクトリで実行
cd mcp-google-drive
node test-token.cjs
```

このスクリプトは以下を生成します：
- 🔑 Firebase カスタムトークン
- 📋 Cursor用設定JSON（ローカル開発・本番両方）
- 📝 設定手順

#### 従来のCursor設定（supergateway使用）

**⚠️ 非推奨**: 複雑でパフォーマンスに影響があるため、上記のクエリパラメータ方式を推奨

```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "command": "npx",
      "args": [
        "-y",
        "supergateway",
        "--sse",
        "https://your-firebase-mcp-server.run.app/mcp",
        "--header",
        "Authorization:Bearer YOUR_FIREBASE_ID_TOKEN"
      ]
    }
  }
}
```

#### 他のMCPクライアント（VS Code等）

**ヘッダー認証対応クライアント**:
```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://your-firebase-mcp-server.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_FIREBASE_ID_TOKEN"
      }
    }
  }
}
```

**クエリパラメータ認証対応クライアント**:
```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://your-firebase-mcp-server.run.app/mcp?token=YOUR_FIREBASE_ID_TOKEN"
    }
  }
}
```

### ローカル開発の場合（OAuth認証）

```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

**注意**: ローカル開発では認証ミドルウェアが無効化され、OAuth認証が使用されます。

## リモートデプロイ

### Google Cloud Runへのデプロイ（Firebase認証）

#### 1. Firebase プロジェクトとGoogle Cloud の統合

```bash
# Firebase プロジェクトがGoogle Cloud プロジェクトと統合されていることを確認
gcloud config set project YOUR_FIREBASE_PROJECT_ID

# 必要なAPIを有効化
gcloud services enable run.googleapis.com
gcloud services enable drive.googleapis.com 
gcloud services enable sheets.googleapis.com 
gcloud services enable docs.googleapis.com 
gcloud services enable slides.googleapis.com
```

#### 2. Firebase サービスアカウントの設定

```bash
# Firebase サービスアカウントにGoogle Drive APIアクセス権限を付与
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:firebase-adminsdk-xxxxx@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/drive.file"

# サービスアカウントキーを環境変数として準備
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project",...}'
```

#### 3. Cloud Run デプロイメント

```bash
# Firebase サービスアカウント情報を環境変数として設定してデプロイ
gcloud run deploy mcp-google-drive-firebase \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --no-allow-unauthenticated \
  --set-env-vars="MCP_TRANSPORT=http,FIREBASE_SERVICE_ACCOUNT=${FIREBASE_SERVICE_ACCOUNT}" \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10
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
- `npm run check-firebase` - Firebase認証設定をチェック（推奨）
- `npm run generate-cursor-config` - Cursor用Firebase設定を生成（推奨）
- `npm run auto-auth` - OAuth自動認証を実行（ローカル開発用）
- `npm run check-oauth` - OAuth設定をチェック
- `npm run oauth-info` - OAuth設定の詳細を表示

### サーバー起動
- `npm run start` - MCPサーバーを起動（SSE専用）
- `npm run dev` - 開発モード（SSE専用）

### 環境変数

#### Firebase認証用
- `FIREBASE_SERVICE_ACCOUNT` - Firebase サービスアカウントのJSON文字列
- `FIREBASE_SERVICE_ACCOUNT_PATH` - Firebase サービスアカウントファイルのパス

#### 共通設定
- `PORT` - サーバーのポート番号（デフォルト: 8080）
- `NODE_ENV` - 実行環境（production/development）

## トラブルシューティング

### Firebase認証関連の問題

1. **Firebase設定の確認**
   ```bash
   npm run check-firebase
   ```

2. **Firebase IDトークンの期限切れ**
   - Firebase IDトークンは約1時間で期限切れになります
   - クライアント側で`getIdToken(true)`を呼び出してトークンを強制更新

3. **Firebase サービスアカウント権限エラー**
   ```bash
   # Firebase サービスアカウントにGoogle Drive API権限を付与
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:firebase-adminsdk-xxxxx@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/drive.file"
   ```

4. **Firebase認証設定が見つからない場合**
   - `credentials/firebase-service-account.json`ファイルが存在することを確認
   - または`FIREBASE_SERVICE_ACCOUNT`環境変数が設定されていることを確認

### Cursorでツールが認識されない場合

1. **クエリパラメータ認証を使用**（推奨）
   ```bash
   # Firebase IDトークンを生成
   cd mcp-google-drive
   node test-token.cjs
   ```

   ```json
   {
     "mcpServers": {
       "mcp-google-drive": {
         "url": "https://mcp-google-drive-firebase-1032995804784.asia-northeast1.run.app/mcp?token=YOUR_FIREBASE_ID_TOKEN"
       }
     }
   }
   ```

2. **従来のsupergateway方式**（⚠️ 非推奨）
   ```json
   {
     "mcpServers": {
       "mcp-google-drive": {
         "command": "npx",
         "args": [
           "-y", "supergateway", "--sse",
           "https://your-server.run.app/mcp",
           "--header", "Authorization:Bearer YOUR_FIREBASE_ID_TOKEN"
         ]
       }
     }
   }
   ```

3. **Firebase IDトークンの手動取得**
   ```javascript
   // クライアント側でFirebase IDトークンを取得
   import { getAuth } from 'firebase/auth';
   const auth = getAuth();
   const idToken = await auth.currentUser.getIdToken();
   ```

### Cloud Runサーバーの問題

1. **Firebase認証エラー（401 Unauthorized）**
   ```bash
   # Firebase IDトークンの確認
   curl -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
        https://your-server.run.app/health
   ```

2. **サービスアカウント設定エラー**
   ```bash
   # Cloud Runサービスの環境変数確認
   gcloud run services describe mcp-google-drive-firebase \
     --region=asia-northeast1 \
     --format="export"
   ```

3. **デプロイの更新**
   ```bash
   # Firebase設定付きで再デプロイ
   gcloud run deploy mcp-google-drive-firebase \
     --source . \
     --region=asia-northeast1 \
     --set-env-vars="FIREBASE_SERVICE_ACCOUNT=${FIREBASE_SERVICE_ACCOUNT}"
   ```

### Google Drive API認証（ローカル開発）

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
