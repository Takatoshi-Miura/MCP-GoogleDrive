import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 認証情報ファイルのパスを設定
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH || path.join(__dirname, "../credentials/client_secret.json");

/**
 * OAuth設定をチェックし、必要に応じてガイドを表示する
 */
export function checkOAuthSetup(): boolean {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error("❌ 認証情報ファイルが見つかりません。");
      showSetupInstructions();
      return false;
    }

    const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const credentials = JSON.parse(credentialsContent);
    
    const config = credentials.installed || credentials.web;
    const redirectUris = config.redirect_uris || [];
    
    // localhost:8080が含まれているかチェック
    const hasLocalhost = redirectUris.some((uri: string) => 
      uri.includes("localhost:8080") || uri.includes("127.0.0.1:8080")
    );
    
    if (!hasLocalhost) {
      console.warn("⚠️  OAuth設定の更新が必要です。");
      showRedirectUriInstructions();
      return false;
    }
    
    console.log("✅ OAuth設定は正常です。");
    return true;
    
  } catch (error) {
    console.error("OAuth設定チェックエラー:", error);
    showSetupInstructions();
    return false;
  }
}

/**
 * 初期セットアップ手順を表示
 */
function showSetupInstructions(): void {
  console.log(`
🚀 Google OAuth設定ガイド
==========================

1. Google Cloud Console（https://console.cloud.google.com/）にアクセス

2. プロジェクトを作成または選択

3. 以下のAPIを有効化:
   - Google Drive API
   - Google Sheets API
   - Google Docs API
   - Google Slides API

4. 「APIとサービス」→「認証情報」に移動

5. 「認証情報を作成」→「OAuthクライアントID」を選択

6. アプリケーションの種類で「デスクトップアプリ」を選択

7. 認証済みのリダイレクトURIに以下を追加:
   - http://localhost:8080

8. 作成した認証情報のJSONをダウンロード

9. ダウンロードしたJSONファイルを以下の場所に保存:
   ${CREDENTIALS_PATH}

10. 再度このスクリプトを実行してください
`);
}

/**
 * リダイレクトURI追加手順を表示
 */
function showRedirectUriInstructions(): void {
  console.log(`
🔧 OAuth設定の更新が必要です
============================

Google Cloud ConsoleでリダイレクトURIを追加してください:

1. Google Cloud Console（https://console.cloud.google.com/）にアクセス

2. 「APIとサービス」→「認証情報」に移動

3. 既存のOAuthクライアントIDを選択

4. 「認証済みのリダイレクトURI」に以下を追加:
   - http://localhost:8080

5. 「保存」をクリック

6. 更新されたJSONファイルをダウンロードして、以下の場所に保存:
   ${CREDENTIALS_PATH}

7. 再度認証スクリプトを実行してください
`);
}

/**
 * OAuth設定の詳細情報を表示
 */
export function showOAuthInfo(): void {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error("認証情報ファイルが見つかりません。");
      return;
    }

    const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const credentials = JSON.parse(credentialsContent);
    
    const config = credentials.installed || credentials.web;
    
    console.log(`
📋 現在のOAuth設定情報
======================
クライアントID: ${config.client_id}
リダイレクトURI: ${JSON.stringify(config.redirect_uris, null, 2)}
認証URI: ${config.auth_uri}
トークンURI: ${config.token_uri}
`);
    
  } catch (error) {
    console.error("OAuth情報表示エラー:", error);
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case "check":
      checkOAuthSetup();
      break;
    case "info":
      showOAuthInfo();
      break;
    default:
      console.log("使用方法: node build/setup-oauth.js [check|info]");
      break;
  }
} 