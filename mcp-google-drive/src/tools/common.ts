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
  if (!auth) {
    return {
      content: [
        {
          type: "text",
          text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
        },
      ],
      isError: true
    };
  }
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