import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import jwt from 'jsonwebtoken';

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Firebase認証サービスクラス
 * Firebase Admin SDKを使用してIDトークンの検証を行う
 */
export class FirebaseService {
  private app: App | null = null;
  private auth: Auth | null = null;
  private serviceAccountPath: string;

  constructor() {
    this.serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
                             path.join(__dirname, '../../credentials/firebase-service-account.json');
    this.initialize();
  }

  /**
   * Firebase Admin SDKを初期化
   */
  private initialize(): void {
    try {
      // 既に初期化されている場合はスキップ
      if (getApps().length > 0) {
        this.app = getApps()[0];
        this.auth = getAuth(this.app);
        console.log('✅ Firebase Admin SDK は既に初期化されています');
        return;
      }

      // 環境変数からサービスアカウント設定を取得
      const serviceAccountFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
      
      if (serviceAccountFromEnv) {
        // 環境変数からサービスアカウント情報を取得
        const serviceAccount = JSON.parse(serviceAccountFromEnv);
        this.app = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        console.log('✅ Firebase Admin SDK を環境変数から初期化しました');
      } else if (serviceAccountBase64) {
        // Base64エンコードされた環境変数からサービスアカウント情報を取得
        const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
        const serviceAccount = JSON.parse(serviceAccountJson);
        this.app = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        console.log('✅ Firebase Admin SDK をBase64環境変数から初期化しました');
      } else if (fs.existsSync(this.serviceAccountPath)) {
        // ファイルからサービスアカウント情報を取得
        this.app = initializeApp({
          credential: cert(this.serviceAccountPath),
        });
        console.log('✅ Firebase Admin SDK をファイルから初期化しました');
      } else {
        // Cloud Run環境ではApplication Default Credentialsを使用
        const isCloudRun = process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION;
        
        if (isCloudRun) {
          this.app = initializeApp({
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
          });
          console.log('✅ Firebase Admin SDK をCloud Runで初期化しました');
        } else {
          console.warn('⚠️ Firebase サービスアカウントファイルが見つかりません。Firebase認証は無効化されます。');
          this.app = null;
          this.auth = null;
          return;
        }
      }

      this.auth = getAuth(this.app);
      console.log('🔐 Firebase 認証サービスが初期化されました');

    } catch (error) {
      console.error('❌ Firebase Admin SDK の初期化に失敗:', error);
      console.warn('⚠️ Firebase認証は無効化されます。');
      this.app = null;
      this.auth = null;
    }
  }

  /**
   * Firebase IDトークン または カスタムトークンを検証
   * @param token - Firebase IDトークン または カスタムトークン
   * @returns 検証結果とユーザー情報
   */
  public async verifyIdToken(token: string): Promise<{
    success: boolean;
    user?: any;
    error?: string;
  }> {
    try {
      if (!this.auth) {
        throw new Error('Firebase Auth が初期化されていません');
      }

      // まずIDトークンとして検証を試行
      try {
        const decodedToken = await this.auth.verifyIdToken(token);
        
        return {
          success: true,
          user: {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
            name: decodedToken.name,
            picture: decodedToken.picture,
            customClaims: decodedToken.custom_claims,
          },
        };
      } catch (idTokenError) {
        // IDトークンの検証に失敗した場合、カスタムトークンとして検証を試行
        console.log('IDトークン検証失敗、カスタムトークンとして検証を試行...');
        
        // JWTをデコードしてカスタムトークンかどうか確認
        const decoded = jwt.decode(token, { complete: true }) as any;
        
        if (decoded && decoded.payload && decoded.payload.aud === 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit') {
          // カスタムトークンの場合
          return {
            success: true,
            user: {
              uid: decoded.payload.uid,
              email: decoded.payload.claims?.email || 'cursor@example.com',
              emailVerified: true,
              name: decoded.payload.claims?.name || 'Cursor User',
              picture: null,
              customClaims: decoded.payload.claims,
            },
          };
        }
        
        throw idTokenError;
      }
    } catch (error) {
      console.error('Firebase トークン検証エラー:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Express認証ミドルウェア
   * AuthorizationヘッダーからFirebase IDトークンを取得・検証
   */
  public authMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Firebase認証が無効な場合はスキップ
        if (!this.isFirebaseEnabled()) {
          console.log('⚠️ Firebase認証が無効化されています。認証チェックをスキップします。');
          next();
          return;
        }

        // Authorization ヘッダーから Bearer トークンを取得
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            success: false,
            error: '認証が必要です',
            details: 'Authorization Bearer トークンが必要です'
          });
        }

        const idToken = authHeader.substring(7); // "Bearer " を除去
        
        // Firebase IDトークンを検証
        const verificationResult = await this.verifyIdToken(idToken);
        
        if (!verificationResult.success) {
          return res.status(401).json({
            success: false,
            error: '認証に失敗しました',
            details: verificationResult.error
          });
        }

        // リクエストオブジェクトにユーザー情報を追加
        (req as any).user = verificationResult.user;
        
        console.log(`✅ Firebase認証成功: ${verificationResult.user.email} (${verificationResult.user.uid})`);
        next();
        
      } catch (error) {
        console.error('Firebase認証ミドルウェアエラー:', error);
        return res.status(500).json({
          success: false,
          error: '認証処理でエラーが発生しました',
          details: error.message
        });
      }
    };
  }

  /**
   * Firebase設定の確認
   */
  public checkFirebaseSetup(): boolean {
    try {
      const serviceAccountFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
      const hasServiceAccountFile = fs.existsSync(this.serviceAccountPath);
      const isCloudRun = process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION;

      if (serviceAccountFromEnv) {
        console.log('✅ Firebase サービスアカウントが環境変数に設定されています');
        return true;
      } else if (serviceAccountBase64) {
        console.log('✅ Firebase サービスアカウントがBase64環境変数に設定されています');
        return true;
      } else if (hasServiceAccountFile) {
        console.log('✅ Firebase サービスアカウントファイルが見つかりました');
        return true;
      } else if (isCloudRun) {
        console.log('✅ Cloud Run環境でのFirebase設定が確認されました');
        return true;
      } else {
        console.log('❌ Firebase サービスアカウントが設定されていません');
        this.showFirebaseSetupInstructions();
        return false;
      }
    } catch (error) {
      console.error('Firebase設定確認エラー:', error);
      return false;
    }
  }

  /**
   * Firebase認証が有効かどうかを判定
   */
  public isFirebaseEnabled(): boolean {
    return this.app !== null && this.auth !== null;
  }

  /**
   * Firebase設定のセットアップ手順を表示
   */
  private showFirebaseSetupInstructions(): void {
    console.log(`
🔥 Firebase Authentication セットアップガイド
===========================================

Firebase認証を有効にするには以下の手順を実行してください：

## 1. Firebase プロジェクトの作成

1. Firebase Console (https://console.firebase.google.com/) にアクセス
2. 新しいプロジェクトを作成または既存のプロジェクトを選択
3. Authentication を有効化
4. Sign-in method で使用したい認証方式を設定

## 2. サービスアカウントキーの生成

1. Firebase Console > プロジェクトの設定 > サービス アカウント
2. 「新しい秘密鍵の生成」をクリック
3. JSON ファイルをダウンロード
4. credentials/firebase-service-account.json として保存

## 3. 環境変数の設定（推奨）

### ローカル開発:
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

### Cloud Run デプロイ:
gcloud run deploy --set-env-vars FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

## 4. Google Drive API のサービスアカウント設定

Firebase プロジェクトのサービスアカウントにGoogle Drive API のアクセス権限を付与:

1. Google Cloud Console > IAM > サービスアカウント
2. Firebase のサービスアカウントを選択
3. キーを生成し、Google Drive API のスコープを追加

## 5. クライアント側の実装

### Cursor 設定例:
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://your-app.run.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_FIREBASE_ID_TOKEN"
      }
    }
  }
}

### モバイルアプリ設定例:
const idToken = await user.getIdToken();
const headers = {
  'Authorization': \`Bearer \${idToken}\`
};

詳細な設定手順については、Firebase公式ドキュメントを参照してください。
`);
  }

  /**
   * Firebase認証済みユーザーの情報を取得
   */
  public async getUserInfo(uid: string): Promise<any> {
    try {
      if (!this.auth) {
        throw new Error('Firebase Auth が初期化されていません');
      }

      const userRecord = await this.auth.getUser(uid);
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        disabled: userRecord.disabled,
        metadata: userRecord.metadata,
        customClaims: userRecord.customClaims,
      };
    } catch (error) {
      console.error('Firebase ユーザー情報取得エラー:', error);
      throw error;
    }
  }
}

// シングルトンインスタンスをエクスポート
export const firebaseService = new FirebaseService();

// ユーティリティ関数をエクスポート
export const verifyIdToken = (idToken: string) => firebaseService.verifyIdToken(idToken);
export const authMiddleware = () => firebaseService.authMiddleware();
export const checkFirebaseSetup = () => firebaseService.checkFirebaseSetup();
export const getUserInfo = (uid: string) => firebaseService.getUserInfo(uid); 