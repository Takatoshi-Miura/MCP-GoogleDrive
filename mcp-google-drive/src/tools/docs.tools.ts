import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocsService } from "../services/docs.service.js";
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

export function registerDocsTools(
  server: McpServer, 
  getAuthClient: () => Promise<OAuth2Client | null>
) {
  // Googleドキュメントのタブ一覧を取得するツール
  server.tool(
    "g_drive_get_doc_tabs",
    "Googleドキュメントのタブ一覧を取得する",
    {
      documentId: z.string().describe("ドキュメントID")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const docsService = new DocsService(auth);
        const tabs = await docsService.getDocumentTabs(args.documentId);
        
        return createSuccessResponse({
          status: "success",
          tabs: tabs,
          tabCount: tabs.length
        });
      } catch (error) {
        return createErrorResponse("ドキュメントのタブ一覧取得に失敗しました", error);
      }
    }
  );

  // Googleドキュメントの内容を全取得するツール
  server.tool(
    "g_drive_get_doc_content",
    "Googleドキュメントの内容を全取得(タブ考慮)",
    {
      documentId: z.string().describe("ドキュメントID")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const docsService = new DocsService(auth);
        const content = await docsService.getDocContent(args.documentId);
        
        return createSuccessResponse({
          status: "success",
          document: content
        });
      } catch (error) {
        return createErrorResponse("ドキュメントの内容取得に失敗しました", error);
      }
    }
  );

  // Googleドキュメントの内容を取得するツール（タブID指定）
  server.tool(
    "g_drive_get_doc_tab_text",
    "Googleドキュメントの内容を取得(タブID指定)",
    {
      documentId: z.string().describe("ドキュメントID"),
      tabId: z.string().describe("タブID")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const docsService = new DocsService(auth);
        const text = await docsService.getDocumentTabText(args.documentId, args.tabId);
        
        return createSuccessResponse({
          status: "success",
          text: text
        });
      } catch (error) {
        return createErrorResponse("タブの内容取得に失敗しました", error);
      }
    }
  );

  // Googleドキュメントのコメントを取得するツール
  server.tool(
    "g_drive_get_doc_comments",
    "Googleドキュメントのコメントを取得する",
    {
      documentId: z.string().describe("ドキュメントID")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const docsService = new DocsService(auth);
        const comments = await docsService.getDocumentComments(args.documentId);
        
        return createSuccessResponse(comments);
      } catch (error) {
        return createErrorResponse("ドキュメントのコメント取得に失敗しました", error);
      }
    }
  );

  // Googleドキュメントに指定位置にテキストを挿入するツール
  server.tool(
    "g_drive_insert_text_to_doc",
    "Googleドキュメントに指定位置にテキストを挿入",
    {
      documentId: z.string().describe("ドキュメントID"),
      location: z.number().describe("挿入位置（文字インデックス）"),
      text: z.string().describe("挿入するテキスト")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const docsService = new DocsService(auth);
        const result = await docsService.insertTextToDoc(
          args.documentId,
          args.location,
          args.text
        );
        
        return createSuccessResponse({
          status: "success",
          message: "ドキュメントにテキストを挿入しました",
          result
        });
      } catch (error) {
        return createErrorResponse("ドキュメントへのテキスト挿入に失敗しました", error);
      }
    }
  );

  // Googleドキュメント内のテキストを置換するツール
  server.tool(
    "g_drive_replace_text_in_doc",
    "Googleドキュメント内のテキストを置換",
    {
      documentId: z.string().describe("ドキュメントID"),
      text: z.string().describe("置換対象のテキスト"),
      replaceText: z.string().describe("置換後のテキスト"),
      matchCase: z.boolean().optional().describe("大文字・小文字を区別するか（デフォルト: false）")
    },
    async (args) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const docsService = new DocsService(auth);
        const result = await docsService.replaceTextInDoc(
          args.documentId,
          args.text,
          args.replaceText,
          args.matchCase || false
        );
        
        return createSuccessResponse({
          status: "success",
          message: "ドキュメント内のテキストを置換しました",
          result
        });
      } catch (error) {
        return createErrorResponse("ドキュメント内のテキスト置換に失敗しました", error);
      }
    }
  );
} 