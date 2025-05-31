import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { PdfService } from "../services/pdf.service.js";
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

export function registerPdfTools(
  server: McpServer, 
  getAuthClient: () => Promise<OAuth2Client | null>
) {
  // GoogleドライブのPDFファイルからテキスト情報を抽出するツール
  server.tool(
    "g_drive_extract_pdf_text",
    "GoogleドライブのPDFファイルからテキスト情報を抽出",
    {
      fileId: z.string().describe("PDFファイルのID")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const pdfService = new PdfService(auth);
        const result = await pdfService.extractPdfText(args.fileId);
        
        return createSuccessResponse(result);
      } catch (error) {
        return createErrorResponse("PDFテキストの抽出に失敗しました", error);
      }
    }
  );
} 