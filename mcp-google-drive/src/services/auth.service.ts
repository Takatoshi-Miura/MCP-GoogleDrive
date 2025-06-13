import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { authenticate } from "@google-cloud/local-auth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Google認証サービスクラス
 * OAuth2認証、トークン管理、設定チェック機能を提供
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
   * 保存されたトークンからOAuth2クライアントを取得
   */
  public async authorize(): Promise<OAuth2Client | null> {
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
export const showOAuthInfo = () => authService.showOAuthInfo(); 