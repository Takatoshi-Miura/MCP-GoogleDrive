import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { authenticate } from "@google-cloud/local-auth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { firebaseService } from "./firebase.service.js";

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Google認証サービスクラス
 * Firebase認証、OAuth2認証、トークン管理、設定チェック機能を提供
 */
export class AuthService {
  private credentialsPath: string;
  private tokenPath: string;
  private scopes: string[];

  constructor() {
    this.credentialsPath = process.env.CREDENTIALS_PATH || path.join(__dirname, "../../credentials/client_secret.json");
    this.tokenPath = process.env.TOKEN_PATH || path.join(__dirname, "../../credentials/token.json");
    this.scopes = [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents"
    ];
  }

  /**
   * Firebase認証を通じてGoogle Drive APIアクセス用のOAuth2Clientを作成
   * Firebase認証はリクエストレベルで行われるため、
   * ここではサービスアカウントまたはApplication Default Credentialsを使用
   */
  private async getFirebaseServiceAuth(): Promise<OAuth2Client | null> {
    try {
      console.log('🔐 Firebase認証を通じたGoogle Drive API認証を試行中...');
      
      // Firebase認証が成功した場合は、サービスアカウント認証を使用
      const auth = new google.auth.GoogleAuth({
        scopes: this.scopes,
      });
      
      const authClient = await auth.getClient();
      console.log('✅ Firebase認証を通じたGoogle Drive API認証が成功しました');
      return authClient as OAuth2Client;
    } catch (error) {
      console.warn('Firebase認証を通じたGoogle Drive API認証に失敗:', error.message);
      return null;
    }
  }

  /**
   * 環境変数からOIDC ID Tokenを取得してOAuth2Clientを作成
   */
  private async getOidcTokenAuth(): Promise<OAuth2Client | null> {
    try {
      const oidcToken = process.env.GOOGLE_OIDC_TOKEN || process.env.MCP_GOOGLE_OIDC_TOKEN;
      
      if (!oidcToken) {
        console.log('OIDC ID Token が環境変数に設定されていません');
        return null;
      }

      console.log('🔐 OIDC ID Token を使用した認証を試行中...');
      
      // OIDC ID Tokenを使用してOAuth2Clientを作成
      const auth = new google.auth.GoogleAuth({
        scopes: this.scopes,
      });
      
      // ID Tokenを設定
      const authClient = await auth.getClient();
      if (authClient instanceof OAuth2Client) {
        // ID Tokenをaccess tokenとして設定（簡易的な方法）
        authClient.setCredentials({
          access_token: oidcToken,
          token_type: 'Bearer'
        });
        
        console.log('✅ OIDC ID Token認証が成功しました');
        return authClient;
      }
      
      return null;
    } catch (error) {
      console.warn('OIDC ID Token認証に失敗:', error.message);
      return null;
    }
  }

  /**
   * Cloud Run環境でのService Account認証
   */
  private async getServiceAccountAuth(): Promise<OAuth2Client | null> {
    try {
      // Cloud Run環境でのサービスアカウント認証
      const auth = new google.auth.GoogleAuth({
        scopes: this.scopes,
      });
      
      const authClient = await auth.getClient();
      return authClient as OAuth2Client;
    } catch (error) {
      console.warn('Service Account認証に失敗:', error.message);
      return null;
    }
  }

  /**
   * Secret Managerから認証情報を取得
   */
  private async getCredentialsFromSecret(): Promise<any> {
    try {
      const secretValue = process.env.GOOGLE_CREDENTIALS;
      if (!secretValue) return null;
      
      return JSON.parse(secretValue);
    } catch (error) {
      console.warn('Secret Manager認証情報の取得に失敗:', error.message);
      return null;
    }
  }

  /**
   * Cloud Run環境かどうかを判定
   */
  private isCloudRun(): boolean {
    return !!(process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION);
  }

  /**
   * Firebase認証が有効かどうかを判定
   */
  private isFirebaseEnabled(): boolean {
    return firebaseService.isFirebaseEnabled();
  }

  /**
   * OIDC認証の設定状況を確認
   */
  public checkOidcSetup(): boolean {
    const oidcToken = process.env.GOOGLE_OIDC_TOKEN || process.env.MCP_GOOGLE_OIDC_TOKEN;
    
    if (oidcToken) {
      console.log("✅ OIDC ID Token が環境変数に設定されています");
      return true;
    } else {
      console.log("ℹ️ OIDC ID Token が環境変数に設定されていません");
      this.showOidcSetupInstructions();
      return false;
    }
  }

  /**
   * OIDC認証のセットアップ手順を表示
   */
  private showOidcSetupInstructions(): void {
    console.log(`
🔐 OIDC ID Token認証セットアップガイド
=====================================

環境変数でOIDC ID Tokenを設定することで、headers設定なしで認証できます。

## 環境変数の設定方法:

1. 以下のいずれかの環境変数を設定:
   export GOOGLE_OIDC_TOKEN="your-oidc-id-token"
   または
   export MCP_GOOGLE_OIDC_TOKEN="your-oidc-id-token"

2. OIDC ID Tokenの取得方法:

   ### Google Cloud SDK使用:
   gcloud auth print-identity-token

   ### Node.js使用:
   const { GoogleAuth } = require('google-auth-library');
   const auth = new GoogleAuth();
   const client = await auth.getIdTokenClient('https://your-service-url');
   const token = await client.idTokenProvider.fetchIdToken('https://your-service-url');

   ### Python使用:
   from google.auth.transport.requests import Request
   from google.oauth2 import id_token
   import google.auth
   
   credentials, project = google.auth.default()
   request = Request()
   token = id_token.fetch_id_token(request, 'https://your-service-url')

## 使用例:
export GOOGLE_OIDC_TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6..."
npm start

これにより、MCPクライアントのheaders設定なしでGoogle Drive APIにアクセスできます。
`);
  }

  /**
   * OAuth設定をチェックし、必要に応じてガイドを表示する
   */
  public checkOAuthSetup(): boolean {
    try {
      if (!fs.existsSync(this.credentialsPath)) {
        console.error("❌ 認証情報ファイルが見つかりません。");
        this.showSetupInstructions();
        return false;
      }

      const credentialsContent = fs.readFileSync(this.credentialsPath, "utf8");
      const credentials = JSON.parse(credentialsContent);
      
      const config = credentials.installed || credentials.web;
      const redirectUris = config.redirect_uris || [];
      
      // localhostが含まれているかチェック
      const hasLocalhost = redirectUris.some((uri: string) => 
        uri.includes("localhost") || uri.includes("127.0.0.1")
      );
      
      if (!hasLocalhost) {
        console.warn("⚠️  OAuth設定の更新が必要です。");
        this.showRedirectUriInstructions();
        return false;
      }
      
      console.log("✅ OAuth設定は正常です。");
      return true;
      
    } catch (error) {
      console.error("OAuth設定チェックエラー:", error);
      this.showSetupInstructions();
      return false;
    }
  }

  /**
   * OAuth設定の詳細情報を表示
   */
  public showOAuthInfo(): void {
    try {
      if (!fs.existsSync(this.credentialsPath)) {
        console.error("認証情報ファイルが見つかりません。");
        return;
      }

      const credentialsContent = fs.readFileSync(this.credentialsPath, "utf8");
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

  /**
   * 認証情報からOAuth2クライアントを作成
   */
  public createOAuth2Client(): OAuth2Client | null {
    try {
      if (!fs.existsSync(this.credentialsPath)) {
        console.error(`認証情報ファイルが見つかりません: ${this.credentialsPath}`);
        return null;
      }

      const credentialsContent = fs.readFileSync(this.credentialsPath, "utf8");
      const credentials = JSON.parse(credentialsContent);
      
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
      return new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );
    } catch (error) {
      console.error("OAuth2クライアント作成エラー:", error);
      return null;
    }
  }

  /**
   * @google-cloud/local-authを使用した自動認証
   */
  public async authenticateWithLocalAuth(): Promise<OAuth2Client | null> {
    try {
      console.log("自動認証を開始します...");
      
      const auth = await authenticate({
        keyfilePath: this.credentialsPath,
        scopes: this.scopes,
      });
      
      // トークンをファイルに保存
      fs.writeFileSync(this.tokenPath, JSON.stringify(auth.credentials));
      console.log("認証が完了し、トークンが保存されました。");
      
      return auth;
    } catch (error) {
      console.error("自動認証エラー:", error);
      return null;
    }
  }

  /**
   * 保存されたトークンからOAuth2クライアントを取得（Firebase認証対応）
   */
  public async authorize(): Promise<OAuth2Client | null> {
    // 1. Firebase認証を最優先で試行（Cloud Run環境 / Firebase プロジェクト使用時）
    if (this.isFirebaseEnabled()) {
      console.log("Firebase認証モードを検出しました。サービスアカウント認証を試行します...");
      const firebaseAuth = await this.getFirebaseServiceAuth();
      if (firebaseAuth) {
        return firebaseAuth;
      }
    }

    // 2. OIDC ID Token認証を試行（環境変数から）
    const oidcAuth = await this.getOidcTokenAuth();
    if (oidcAuth) {
      return oidcAuth;
    }

    // 3. Cloud Run環境の場合、Service Account認証を試行
    if (this.isCloudRun()) {
      console.log("Cloud Run環境を検出しました。Service Account認証を試行します...");
      
      const serviceAccountAuth = await this.getServiceAccountAuth();
      if (serviceAccountAuth) {
        console.log("✅ Service Account認証が成功しました");
        return serviceAccountAuth;
      }
      
      // Service Account認証が失敗した場合、Secret Manager認証を試行
      const secretCredentials = await this.getCredentialsFromSecret();
      if (secretCredentials) {
        console.log("Secret Manager認証情報を使用します...");
        const { client_secret, client_id, redirect_uris } = secretCredentials.installed || secretCredentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        
        // Cloud Run環境では通常、事前に認証されたトークンを使用
        console.warn("⚠️ Cloud Run環境でOAuth認証が必要です。Service Accountの使用を推奨します。");
        return oAuth2Client;
      }
      
      console.warn("⚠️ Cloud Run環境での認証設定が見つかりません。機能が制限されます。");
      return null;
    }
    
    // ローカル環境での通常のOAuth認証フロー
    const oAuth2Client = this.createOAuth2Client();
    if (!oAuth2Client) return null;
    
    // トークンファイルがすでに存在するか確認
    if (fs.existsSync(this.tokenPath)) {
      try {
        const tokenContent = fs.readFileSync(this.tokenPath, "utf8");
        const token = JSON.parse(tokenContent);
        oAuth2Client.setCredentials(token);
        
        // トークンが有効期限切れかどうか確認
        const currentTime = Date.now();
        if (token.expiry_date && token.expiry_date > currentTime) {
          return oAuth2Client;
        } else if (token.refresh_token) {
          // リフレッシュトークンがある場合は更新を試みる
          try {
            const { credentials } = await oAuth2Client.refreshAccessToken();
            oAuth2Client.setCredentials(credentials);
            
            // 更新したトークンを保存
            fs.writeFileSync(this.tokenPath, JSON.stringify(credentials));
            return oAuth2Client;
          } catch (refreshError) {
            console.error("トークン更新エラー:", refreshError);
            return null;
          }
        }
      } catch (error) {
        console.error("トークン読み込みエラー:", error);
      }
    }
    
    // トークンファイルがない場合、nullを返す
    console.log("トークンファイルが見つかりません。認証を実行してください。");
    return null;
  }

  /**
   * 自動認証プロセスを実行
   */
  public async runAutoAuth(): Promise<void> {
    try {
      console.log("=================================");
      console.log("Google Drive 自動認証を開始します");
      console.log("=================================\n");
      
      // OAuth設定をチェック
      console.log("OAuth設定を確認しています...");
      if (!this.checkOAuthSetup()) {
        console.log("\n設定を修正してから再度実行してください。");
        throw new Error("OAuth設定エラー");
      }
      
      // 既存のトークンファイルがある場合は確認
      if (fs.existsSync(this.tokenPath)) {
        console.log("\n既存のトークンファイルが見つかりました。");
        console.log("新しいトークンを生成すると、既存のトークンは上書きされます。");
        
        // 既存のトークンを削除
        fs.unlinkSync(this.tokenPath);
        console.log("既存のトークンファイルを削除しました。\n");
      }
      
      console.log("\nGoogle公式ライブラリを使用した自動認証を実行します...");
      const authClient = await this.authenticateWithLocalAuth();
      
      if (authClient) {
        console.log("\n✅ 認証が正常に完了しました！");
        console.log(`📄 トークンファイル: ${this.tokenPath}`);
        console.log("\n🎉 これでMCPサーバーを使用する準備が整いました。");
        console.log("\n📖 使用方法:");
        console.log("   npm run build");
        console.log("   npm start");
      } else {
        console.error("\n❌ 認証に失敗しました。");
        throw new Error("認証失敗");
      }
      
    } catch (error) {
      console.error("\n❌ 認証プロセス中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * 初期セットアップ手順を表示
   */
  private showSetupInstructions(): void {
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
   - http://localhost

8. 作成した認証情報のJSONをダウンロード

9. ダウンロードしたJSONファイルを以下の場所に保存:
   ${this.credentialsPath}

10. 再度このスクリプトを実行してください
`);
  }

  /**
   * リダイレクトURI追加手順を表示
   */
  private showRedirectUriInstructions(): void {
    console.log(`
🔧 OAuth設定の更新が必要です
============================

Google Cloud ConsoleでリダイレクトURIを追加してください:

1. Google Cloud Console（https://console.cloud.google.com/）にアクセス

2. 「APIとサービス」→「認証情報」に移動

3. 既存のOAuthクライアントIDを選択

4. 「認証済みのリダイレクトURI」に以下を追加:
   - http://localhost

5. 「保存」をクリック

6. 更新されたJSONファイルをダウンロードして、以下の場所に保存:
   ${this.credentialsPath}

7. 再度認証スクリプトを実行してください
`);
  }
}

// シングルトンインスタンスを作成してエクスポート
export const authService = new AuthService();

// レガシー互換性のための関数エクスポート
export const createOAuth2Client = () => authService.createOAuth2Client();
export const authenticateWithLocalAuth = () => authService.authenticateWithLocalAuth();
export const authorize = () => authService.authorize();
export const checkOAuthSetup = () => authService.checkOAuthSetup();
export const checkOidcSetup = () => authService.checkOidcSetup();
export const showOAuthInfo = () => authService.showOAuthInfo();
export const checkFirebaseSetup = () => firebaseService.checkFirebaseSetup(); 