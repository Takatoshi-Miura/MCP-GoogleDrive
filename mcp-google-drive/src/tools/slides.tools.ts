import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SlidesService } from "../services/slides.service.js";
import { OAuth2Client } from "google-auth-library";
import { checkAuthAndReturnError } from "./common.js";

// レスポンス型定義
interface SuccessResponse {
  content: Array<{
    type: "text";
    text: string;
    [x: string]: unknown;
  }>;
  [x: string]: unknown;
}

interface ErrorResponse {
  content: Array<{
    type: "text";
    text: string;
    [x: string]: unknown;
  }>;
  isError: true;
  [x: string]: unknown;
}

/**
 * 成功時のレスポンスを作成します
 * @param data レスポンスデータ
 * @returns 成功レスポンス
 */
function createSuccessResponse(data: any): SuccessResponse {
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
function createErrorResponse(errorMessage: string, error?: any): ErrorResponse {
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? `${errorMessage}: ${error.message}` : errorMessage
      }
    ],
    isError: true
  };
}

export function registerSlidesTools(
  server: McpServer, 
  getAuthClient: () => Promise<OAuth2Client | null>
) {
  // Googleスライドに含まれるテキストデータのみを取得するツール
  server.tool(
    "g_drive_get_presentation_text",
    "Googleスライドに含まれるテキストデータのみを取得",
    {
      presentationId: z.string().describe("プレゼンテーションID")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const slidesService = new SlidesService(auth);
        const text = await slidesService.getPresentationText(args.presentationId);
        
        return createSuccessResponse({
          status: "success",
          text: text
        });
      } catch (error) {
        return createErrorResponse("スライドのテキスト取得に失敗しました", error);
      }
    }
  );

  // Googleスライドの特定ページを番号指定で取得するツール
  server.tool(
    "g_drive_get_slide_by_page_number",
    "Googleスライドの特定ページを番号指定で取得",
    {
      presentationId: z.string().describe("プレゼンテーションID"),
      pageNumber: z.number().describe("ページ番号（1から開始）")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const slidesService = new SlidesService(auth);
        const slide = await slidesService.getSlideByPageNumber(
          args.presentationId,
          args.pageNumber
        );
        
        return createSuccessResponse({
          status: "success",
          data: slide
        });
      } catch (error) {
        return createErrorResponse("スライドの取得に失敗しました", error);
      }
    }
  );

  // Googleスライドのコメントを取得するツール
  server.tool(
    "g_drive_get_presentation_comments",
    "Googleスライドのコメントを取得",
    {
      presentationId: z.string().describe("プレゼンテーションID")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const slidesService = new SlidesService(auth);
        const comments = await slidesService.getPresentationComments(args.presentationId);
        
        return createSuccessResponse({
          status: "success",
          comments: comments
        });
      } catch (error) {
        return createErrorResponse("スライドのコメント取得に失敗しました", error);
      }
    }
  );
} 