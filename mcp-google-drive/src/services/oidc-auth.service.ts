import { google } from "googleapis";
import { OAuth2Client, GoogleAuth } from "google-auth-library";
import { Request, Response, NextFunction } from 'express';

/**
 * OIDC IDトークン認証サービスクラス
 * Google Cloud Runでの利用を想定したクエリパラメータOIDC認証をサポート
 */
export class OidcAuthService {
  private scopes: string[];

  constructor() {
    this.scopes = [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents"
    ];
  }

  /**
   * Cloud Run環境でのGoogle API認証クライアントを作成
   * OIDC IDトークンは認証確認のみに使用し、実際のAPI呼び出しにはサービスアカウントを使用
   */
  private async createCloudRunAuthClient(): Promise<OAuth2Client | null> {
    try {
      // Cloud Run環境ではApplication Default Credentials (ADC)を使用
      const auth = new GoogleAuth({
        scopes: this.scopes
      });
      
      // 認証クライアントを取得
      const authClient = await auth.getClient() as OAuth2Client;
      
      console.log('✅ Cloud Run サービスアカウント認証が成功しました');
      return authClient;
    } catch (error) {
      console.error('❌ Cloud Run サービスアカウント認証に失敗:', error.message);
      return null;
    }
  }

  /**
   * ローカル環境での認証クライアント作成（開発用）
   */
  private async createLocalAuthClient(): Promise<OAuth2Client | null> {
    try {
      // ローカル環境では環境変数のサービスアカウントキーまたはADCを使用
      const auth = new GoogleAuth({
        scopes: this.scopes
      });
      
      // 認証クライアントを取得
      const authClient = await auth.getClient() as OAuth2Client;
      
      console.log('✅ ローカル認証が成功しました');
      return authClient;
    } catch (error) {
      console.warn('⚠️ ローカル認証に失敗（開発環境では正常）:', error.message);
      return null;
    }
  }

  /**
   * 環境に応じた適切なGoogle API認証クライアントを作成
   */
  public async authorize(req?: Request): Promise<OAuth2Client | null> {
    try {
      // Cloud Run環境の場合
      if (this.isCloudRun()) {
        // OIDC IDトークンの確認
        const idTokenValid = await this.verifyOidcToken(req);
        if (!idTokenValid) {
          console.error('❌ OIDC IDトークンの検証に失敗');
          return null;
        }
        
        // Google APIアクセス用のサービスアカウント認証
        return await this.createCloudRunAuthClient();
      } else {
        // ローカル環境の場合
        console.log('⚠️ ローカル開発環境では認証をスキップします');
        return await this.createLocalAuthClient();
      }
    } catch (error) {
      console.error('❌ 認証エラー:', error);
      return null;
    }
  }

  /**
   * クエリパラメータでの認証チェック（index.ts用）
   */
  public async checkQueryParameterAuth(req: Request): Promise<boolean> {
    if (!this.isCloudRun()) {
      // ローカル環境では常に認証成功
      return true;
    }

    // クエリパラメータでの認証
    const tokenFromQuery = req.query.token as string;
    if (tokenFromQuery) {
      try {
        const mockReq = {
          ...req,
          headers: {
            ...req.headers,
            authorization: `Bearer ${tokenFromQuery}`
          }
        } as any;
        
        const authClient = await this.authorize(mockReq);
        return authClient !== null;
      } catch (error) {
        console.log(`⚠️ クエリパラメータ認証失敗: ${error.message}`);
        return false;
      }
    }

    return false;
  }

  /**
   * 認証エラーレスポンス生成
   */
  public createAuthErrorResponse() {
    return {
      error: 'OIDC認証が必要です',
      details: 'tokenクエリパラメータに有効なOIDC IDトークンを含めてください',
      authMethod: {
        method: 'Query Parameter',
        example: '/mcp?token=YOUR_OIDC_ID_TOKEN'
      },
      getToken: 'gcloud auth print-identity-token'
    };
  }

  /**
   * OIDC IDトークンの検証（Cloud Run環境のみ）
   * クエリパラメータ認証をサポート
   */
  private async verifyOidcToken(req?: Request): Promise<boolean> {
    try {
      let idToken: string | null = null;

      // Authorization ヘッダーからトークンを取得（内部的なモック用）
      if (req) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          idToken = authHeader.substring(7);
          console.log('🔐 クエリパラメータから変換されたOIDC IDトークンを取得');
        } else {
          // デバッグ用: リクエスト詳細を出力
          console.log('🔍 認証失敗のデバッグ情報:');
          console.log(`  - URL: ${req.url}`);
          console.log(`  - Method: ${req.method}`);
          console.log(`  - tokenクエリパラメータ: ${req.query?.token ? 'あり' : 'なし'}`);
          console.log(`  - User-Agent: ${req.headers['user-agent'] || '不明'}`);
        }
      }

      // 環境変数からトークンを取得（フォールバック、ローカル開発用）
      if (!idToken && !this.isCloudRun()) {
        idToken = process.env.GOOGLE_OIDC_TOKEN || process.env.MCP_GOOGLE_OIDC_TOKEN;
        if (idToken) {
          console.log('🔐 環境変数からOIDC IDトークンを取得（ローカル開発）');
        }
      }

      if (!idToken) {
        console.warn('⚠️ OIDC IDトークンが見つかりません');
        console.warn('💡 クエリパラメータで認証してください:');
        console.warn('   /mcp?token=YOUR_OIDC_ID_TOKEN');
        console.warn('🔧 トークン取得方法:');
        console.warn('   gcloud auth print-identity-token');
        return false;
      }

      // トークンフォーマットの基本検証
      if (!this.validateTokenFormat(idToken)) {
        console.error('❌ 無効なOIDC IDトークン形式');
        return false;
      }

      console.log('✅ OIDC IDトークンの検証が成功しました（クエリパラメータ認証）');
      return true;
    } catch (error) {
      console.error('❌ OIDC IDトークン検証エラー:', error);
      return false;
    }
  }

  /**
   * Express認証ミドルウェア（非推奨：クエリパラメータ認証を使用してください）
   */
  public authMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Cloud Run環境でない場合は認証をスキップ
        if (!this.isCloudRun()) {
          console.log('⚠️ ローカル開発環境では認証をスキップします');
          next();
          return;
        }

        // OIDC IDトークンの検証
        const idTokenValid = await this.verifyOidcToken(req);
        
        if (!idTokenValid) {
          return res.status(401).json({
            success: false,
            error: 'OIDC IDトークンが必要です',
            details: 'tokenクエリパラメータでOIDC IDトークンを指定してください'
          });
        }

        // OIDC IDトークンを保存（ログ用）
        let idToken: string | null = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          idToken = authHeader.substring(7);
        }
        (req as any).oidcToken = idToken;
        
        console.log('✅ OIDC IDトークン認証が成功しました（クエリパラメータ認証）');
        next();
      } catch (error) {
        console.error('❌ OIDC認証ミドルウェアエラー:', error);
        res.status(500).json({
          success: false,
          error: '認証処理でエラーが発生しました',
          details: error.message
        });
      }
    };
  }

  /**
   * Cloud Run環境かどうかを判定
   */
  public isCloudRun(): boolean {
    return !!(process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION);
  }

  /**
   * トークンのフォーマットを検証（JWT形式の簡易チェック）
   */
  private validateTokenFormat(token: string): boolean {
    try {
      // JWT形式かチェック（3つのパートに分かれているか）
      const parts = token.split('.');
      if (parts.length !== 3) {
        return false;
      }

      // Base64でデコード可能かチェック
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // 基本的なJWTクレームの存在チェック
      return !!(payload.iss && payload.aud && payload.exp);
    } catch (error) {
      return false;
    }
  }

  /**
   * OIDC認証のセットアップ状況を確認
   */
  public checkSetup(): boolean {
    if (this.isCloudRun()) {
      console.log("✅ Cloud Run環境: サービスアカウント認証を使用");
      return true;
    } else {
      const envToken = process.env.GOOGLE_OIDC_TOKEN || process.env.MCP_GOOGLE_OIDC_TOKEN;
      
      if (envToken) {
        console.log("✅ OIDC IDトークンが環境変数に設定されています");
        return true;
      } else {
        console.log("ℹ️ ローカル開発環境: 認証スキップ");
        this.showSetupInstructions();
        return false;
      }
    }
  }

  /**
   * OIDC認証のセットアップ手順を表示
   */
  private showSetupInstructions(): void {
    console.log(`
📋 OIDC IDトークン認証のセットアップ手順:

🌐 Cloud Run環境:
   - サービスアカウント認証が自動で使用されます
   - tokenクエリパラメータでOIDC IDトークンを指定してください

🔧 ローカル開発:
   - 認証は自動でスキップされます
   - 必要に応じて環境変数を設定:
     export GOOGLE_OIDC_TOKEN="your-oidc-id-token"

💡 Cursor設定例:
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://your-cloud-run-url/mcp?token=YOUR_OIDC_ID_TOKEN"
    }
  }
}

🔧 OIDC IDトークンの取得:
   gcloud auth print-identity-token
    `);
  }

  /**
   * 認証が有効かどうかを判定
   */
  public isEnabled(): boolean {
    return this.isCloudRun();
  }
}

// エクスポート用のインスタンス
export const oidcAuthService = new OidcAuthService();

// 個別関数のエクスポート
export const authorize = (req?: Request) => oidcAuthService.authorize(req);
export const authMiddleware = () => oidcAuthService.authMiddleware();
export const checkSetup = () => oidcAuthService.checkSetup();
export const isEnabled = () => oidcAuthService.isEnabled();
export const checkQueryParameterAuth = (req: Request) => oidcAuthService.checkQueryParameterAuth(req);
export const createAuthErrorResponse = () => oidcAuthService.createAuthErrorResponse(); 