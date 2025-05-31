import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { SheetsService } from "../services/sheets.service.js";
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

export function registerSheetsTools(server: McpServer, getAuthClient: () => Promise<OAuth2Client | null>) {
  // スプレッドシートから値を取得するツール
  server.tool(
    "g_drive_get_sheet_values",
    "Googleスプレッドシートから値を取得する",
    {
      spreadsheetId: z.string().describe("スプレッドシートのID"),
      range: z.string().describe("取得する範囲（例: Sheet1!A1:B10）"),
    },
    async ({ spreadsheetId, range }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const sheetsService = new SheetsService(auth);
        const values = await sheetsService.getSheetValues(spreadsheetId, range);
        
        return createSuccessResponse({
          status: "success",
          values
        });
      } catch (error) {
        return createErrorResponse("スプレッドシートの値取得に失敗しました", error);
      }
    }
  );

  // スプレッドシートの値を更新するツール
  server.tool(
    "g_drive_update_sheet_values",
    "Googleスプレッドシートの値を更新する",
    {
      spreadsheetId: z.string().describe("スプレッドシートのID"),
      range: z.string().describe("更新する範囲（例: Sheet1!A1:B2）"),
      values: z.array(z.array(z.any())).describe("更新する値の2次元配列"),
    },
    async ({ spreadsheetId, range, values }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const sheetsService = new SheetsService(auth);
        await sheetsService.updateSheetValues(spreadsheetId, range, values);
        
        return createSuccessResponse({
          status: "success",
          message: "スプレッドシートの値を更新しました"
        });
      } catch (error) {
        return createErrorResponse("スプレッドシートの値更新に失敗しました", error);
      }
    }
  );

  // スプレッドシートに値を追加するツール
  server.tool(
    "g_drive_append_sheet_values",
    "Googleスプレッドシートに値を追加する",
    {
      spreadsheetId: z.string().describe("スプレッドシートのID"),
      range: z.string().describe("追加する範囲（例: Sheet1!A1）"),
      values: z.array(z.array(z.any())).describe("追加する値の2次元配列"),
    },
    async ({ spreadsheetId, range, values }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const sheetsService = new SheetsService(auth);
        await sheetsService.appendSheetValues(spreadsheetId, range, values);
        
        return createSuccessResponse({
          status: "success",
          message: "スプレッドシートに値を追加しました"
        });
      } catch (error) {
        return createErrorResponse("スプレッドシートの値追加に失敗しました", error);
      }
    }
  );

  // スプレッドシートのシート一覧を取得するツール
  server.tool(
    "g_drive_get_spreadsheet_sheets",
    "Googleスプレッドシートのシート一覧を取得する",
    {
      spreadsheetId: z.string().describe("スプレッドシートのID"),
    },
    async ({ spreadsheetId }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const sheetsService = new SheetsService(auth);
        const sheets = await sheetsService.getSpreadsheetSheets(spreadsheetId);
        
        return createSuccessResponse({
          status: "success",
          sheets
        });
      } catch (error) {
        return createErrorResponse("スプレッドシートのシート一覧取得に失敗しました", error);
      }
    }
  );

  // スプレッドシートの全シートデータを取得するツール
  server.tool(
    "g_drive_get_all_sheets_data",
    "Googleスプレッドシートの全シートデータを取得する",
    {
      spreadsheetId: z.string().describe("スプレッドシートのID"),
    },
    async ({ spreadsheetId }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const sheetsService = new SheetsService(auth);
        const allSheetsData = await sheetsService.getAllSheetsData(spreadsheetId);
        
        return createSuccessResponse({
          status: "success",
          sheets: allSheetsData
        });
      } catch (error) {
        return createErrorResponse("スプレッドシートの全シートデータ取得に失敗しました", error);
      }
    }
  );

  // Googleスプレッドシートのテキストのみを取得するツール
  server.tool(
    "g_drive_get_spreadsheet_text",
    "Googleスプレッドシートのテキストのみを取得する",
    {
      spreadsheetId: z.string().describe("スプレッドシートのID"),
    },
    async ({ spreadsheetId }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const sheetsService = new SheetsService(auth);
        const textContent = await sheetsService.getSpreadsheetText(spreadsheetId);
        
        return createSuccessResponse({
          status: "success",
          text: textContent
        });
      } catch (error) {
        return createErrorResponse("スプレッドシートのテキスト取得に失敗しました", error);
      }
    }
  );

  // Googleスプレッドシートのコメントを取得するツール
  server.tool(
    "g_drive_get_spreadsheet_comments",
    "Googleスプレッドシートの全シートのコメントを取得する",
    {
      spreadsheetId: z.string().describe("スプレッドシートのID"),
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const sheetsService = new SheetsService(auth);
        const result = await sheetsService.getSpreadsheetComments(args.spreadsheetId);
        
        return createSuccessResponse(result);
      } catch (error) {
        return createErrorResponse("スプレッドシートのコメント取得に失敗しました", error);
      }
    }
  );
} 