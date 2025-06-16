# MCP-GoogleDrive

Model Context Protocol (MCP) を介してGoogle Driveにアクセスするための**SSE（Server-Sent Events）専用MCPサーバー**です。
**多層認証方式**（Cloud Run IAM + アプリケーションレベルOIDC認証 + サービスアカウント認証）によるセキュアなアクセスを提供し、Google Cloud Runでのデプロイに最適化されています。

## ✨ 特徴

- 📡 **SSE専用**: Server-Sent Events（SSE）によるHTTPベースのリアルタイム通信
- 🌐 **Cloud Run最適化**: Google Cloud Runでの運用に最適化されたアーキテクチャ
- 🔒 **多層認証**: アプリケーションレベルOIDC認証 + Google サービスアカウント認証
- 🚀 **本格運用対応**: 実際のプロダクション環境での使用を想定した設計
- 🛠️ **デバッグ容易**: 詳細なログ出力とエラーハンドリング
- 📱 **Cursor対応**: CursorのMCP設定での利用に最適化
- 🔐 **柔軟な認証**: Cloud Run IAM + アプリケーション認証の組み合わせ

## 🔧 機能

- **ファイル管理**: Google Driveのファイル一覧取得・検索
- **Google Spreadsheets**: スプレッドシートの閲覧・編集・グラフ作成
- **Google Docs**: ドキュメントの閲覧・編集・コメント取得
- **Google Slides**: スライドの閲覧・編集・要素追加
- **PDFファイル**: PDFファイルの読み取り

## 🏗️ アーキテクチャ

```
mcp-google-drive/
├── src/
│   ├── services/            # ビジネスロジック層
│   │   ├── oidc-auth.service.ts # OIDC認証サービス
│   │   ├── drive.service.ts     # Google Drive操作
│   │   ├── sheets.service.ts    # Google Sheets操作
│   │   ├── docs.service.ts      # Google Docs操作
│   │   ├── slides.service.ts    # Google Slides操作
│   │   └── pdf.service.ts       # PDF操作
│   ├── tools/               # MCPツール定義
│   ├── types/               # 型定義
│   ├── utils/               # ユーティリティ関数
│   └── index.ts             # エントリーポイント
├── credentials/             # 認証情報（ローカル開発用）
└── build/                   # ビルド結果
```

## 🚀 セットアップガイド

### 前提条件

- Node.js 18以上
- npm
- Google Cloud Platform プロジェクト
- Google Cloud SDK（gcloudコマンド）

### 1. Google Cloud Console での設定

#### 1.1 新しいプロジェクトを作成（必要に応じて）

```bash
gcloud projects create your-project-id
gcloud config set project your-project-id
```

#### 1.2 必要なAPIを有効化

```bash
gcloud services enable run.googleapis.com
gcloud services enable drive.googleapis.com 
gcloud services enable sheets.googleapis.com 
gcloud services enable docs.googleapis.com 
gcloud services enable slides.googleapis.com
```

#### 1.3 サービスアカウントを作成

```bash
# サービスアカウント作成
gcloud iam service-accounts create mcp-client \
    --display-name="MCP Google Drive Client"

# サービスアカウントのメールアドレスを確認
gcloud iam service-accounts list --filter="displayName:MCP Google Drive Client"
```

### 2. プロジェクトのセットアップ

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/MCP-GoogleDrive.git
cd MCP-GoogleDrive/mcp-google-drive

# 依存パッケージをインストール
npm install

# TypeScriptをビルド
npm run build
```

### 3. Cloud Run へのデプロイ

#### 3.1 初回デプロイ

```bash
# Cloud Runにデプロイ
gcloud run deploy mcp-google-drive \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --no-allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10
```

#### 3.2 サービスアカウントの設定

デプロイ後、専用サービスアカウントを設定する必要があります：

```bash
# 専用サービスアカウントを設定
gcloud run services update mcp-google-drive \
  --region=asia-northeast1 \
  --service-account=mcp-client@your-project-id.iam.gserviceaccount.com

# デプロイされたサービスのURLを確認
gcloud run services describe mcp-google-drive \
  --region=asia-northeast1 \
  --format="value(status.url)"
```

#### 3.3 Cloud Run認証設定

MCPプロトコルでは、CursorからPOSTリクエストが送信されますが、Cloud RunのIAMレベルでの認証がこれを拒否する場合があります。この問題を解決するため、**Cloud RunのIAMレベルでの認証を回避し、アプリケーションレベルでのOIDC認証のみを使用**します：

```bash
# すべてのユーザーにCloud Run invoker権限を付与
gcloud run services add-iam-policy-binding mcp-google-drive \
  --region=asia-northeast1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

> **🔐 セキュリティ注意事項**: 
> - Cloud RunのIAMレベルでは認証なしですが、**アプリケーションレベルでOIDC認証**が機能します
> - 有効なOIDC IDトークンがないリクエストは401エラーで拒否されます
> - Google Drive APIへのアクセスはサービスアカウント認証で保護されています

**認証フロー**:
1. **Cloud Run IAM**: 全ユーザーアクセス許可（allUsers）
2. **アプリケーション認証**: OIDC IDトークン検証
3. **Google API認証**: サービスアカウント認証

### 4. Google Drive ファイル共有設定

Cloud RunサービスがGoogle Driveファイルにアクセスするには、**サービスアカウントにファイルを共有**する必要があります：

#### 4.1 サービスアカウントのメールアドレスを確認

```bash
echo "mcp-client@your-project-id.iam.gserviceaccount.com"
```

#### 4.2 Google Driveでファイル共有

1. Google Driveでアクセスさせたいファイル・フォルダを選択
2. 「共有」をクリック
3. サービスアカウントのメールアドレス (`mcp-client@your-project-id.iam.gserviceaccount.com`) を追加
4. 権限を「編集者」または「閲覧者」に設定

> **⚠️ 重要**: この手順を行わないと、MCPツールでファイルが取得できません（0件になります）

### 5. Cursor での設定

#### 5.1 OIDC IDトークンを取得

```bash
gcloud auth print-identity-token
```

#### 5.2 Cursor設定ファイルに追加

```json
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://your-service-url/mcp?token=YOUR_OIDC_ID_TOKEN"
    }
  }
}
```

### 6. 動作確認

```bash
# ヘルスチェック
curl -H "Authorization: Bearer YOUR_OIDC_ID_TOKEN" \
     https://your-service-url/health

# サーバーログを確認
gcloud run services logs read mcp-google-drive --region=asia-northeast1 --limit=10
```

## 📚 利用可能なツール

### ファイル管理・検索
- `g_drive_list_files_by_type` - 指定したタイプのファイル一覧を取得
- `g_drive_search_files` - Google Drive内のファイルを検索

### ファイル閲覧
- `g_drive_get_file_structure` - ファイルの構造を取得
- `g_drive_read_file` - ファイルの全内容を読み取り
- `g_drive_read_file_part` - ファイルを部分的に読み取り
- `g_drive_get_comments` - ファイルのコメントを取得

### ファイル編集
- `g_drive_insert_value` - ドキュメント、スプレッドシート、スライドに値を挿入
- `g_drive_create_chart` - グラフを作成（棒グラフ、円グラフ、折れ線グラフ、散布図）
- `g_drive_create_new_element` - 新規要素を作成（シート、スライド）

**対応ファイル形式**: Google ドキュメント、Google スプレッドシート、Google スライド、PDF

