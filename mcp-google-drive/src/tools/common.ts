import { OAuth2Client } from "google-auth-library";

// レスポンス型定義
export interface SuccessResponse {
  content: Array<{
    type: "text";
    text: string;
    [x: string]: unknown;
  }>;
  [x: string]: unknown;
}

export interface ErrorResponse {
  content: Array<{
    type: "text";
    text: string;
    [x: string]: unknown;
  }>;
  isError: true;
  [x: string]: unknown;
}

export interface AuthErrorResponse extends ErrorResponse {}

/**
 * Google認証のチェックを行い、失敗時は統一されたエラーレスポンスを返します
 * @param auth OAuth2Client | null
 * @returns 認証失敗時のエラーレスポンス、認証成功時はnull
 */
export function checkAuthAndReturnError(auth: OAuth2Client | null): AuthErrorResponse | null {
  console.log('🔍 [checkAuthAndReturnError] 認証チェック開始');
  console.log('🔍 [checkAuthAndReturnError] 認証クライアント:', auth ? `存在 (${auth.constructor.name})` : 'null');
  
  if (!auth) {
    console.log('❌ [checkAuthAndReturnError] 認証クライアントがnullです');
    
    // 詳細なデバッグ情報を含めたエラーメッセージ
    const debugInfo = {
      error: "Google認証に失敗しました",
      cause: "getAuthClient()がnullを返しました",
      possibleReasons: [
        "サービスアカウントキーファイルが見つからない",
        "サービスアカウントキーの権限が不正",
        "Google APIの認証プロセスでエラーが発生",
        "MCPサーバー内の認証フローに問題"
      ],
      debugSteps: [
        "1. credentials/service-account-key.json の存在確認",
        "2. サービスアカウントの権限確認",
        "3. サーバーログの確認",
        "4. 直接認証テストとの比較"
      ],
      timestamp: new Date().toISOString()
    };
    
    return {
      content: [
        {
          type: "text",
          text: `認証エラー詳細:\n${JSON.stringify(debugInfo, null, 2)}`,
        },
      ],
      isError: true
    };
  }
  
  console.log('✅ [checkAuthAndReturnError] 認証チェック成功');
  return null;
}

/**
 * 成功時のレスポンスを作成します
 * @param data レスポンスデータ
 * @returns 成功レスポンス
 */
export function createSuccessResponse(data: any): SuccessResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
  };
}

/**
 * エラー時のレスポンスを作成します
 * @param errorMessage エラーメッセージ
 * @param error エラーオブジェクト (オプション)
 * @returns エラーレスポンス
 */
export function createErrorResponse(errorMessage: string, error?: any): ErrorResponse {
  const message = error instanceof Error ? `${errorMessage}: ${error.message}` : 
                  error ? `${errorMessage}: ${String(error)}` : errorMessage;
  
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
}

/**
 * パラメータ不足エラーのレスポンスを作成します
 * @param requiredParams 必要なパラメータの説明
 * @returns エラーレスポンス
 */
export function createMissingParametersError(requiredParams: string): ErrorResponse {
  return createErrorResponse(`必要なパラメータが不足しています: ${requiredParams}`);
}

/**
 * サポートされていないファイルタイプエラーのレスポンスを作成します
 * @param fileType ファイルタイプ
 * @returns エラーレスポンス
 */
export function createUnsupportedFileTypeError(fileType: string): ErrorResponse {
  return createErrorResponse(`サポートされていないファイルタイプです: ${fileType}`);
} 