import { OAuth2Client } from "google-auth-library";

export interface AuthErrorResponse {
  content: Array<{
    type: "text";
    text: string;
    [x: string]: unknown;
  }>;
  isError: true;
  [x: string]: unknown;
}

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