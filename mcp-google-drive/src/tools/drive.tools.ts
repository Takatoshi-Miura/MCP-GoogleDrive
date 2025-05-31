import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { DriveService } from "../services/drive.service.js";
import { FileType } from "../types/index.js";
import { checkAuthAndReturnError } from "./common.js";

export function registerDriveTools(server: McpServer, getAuthClient: () => Promise<OAuth2Client | null>) {
  // Googleドライブファイル一覧取得ツール
  server.tool(
    "g_drive_list_files_by_type",
    "指定されたタイプのGoogleドライブファイル一覧を取得する",
    {
      fileType: z.enum(['all', 'sheets', 'docs', 'presentations', 'pdf']).describe(
        "取得するファイルの種類: 'all'(全て), 'sheets'(スプレッドシート), 'docs'(ドキュメント), 'presentations'(スライド), 'pdf'(PDFファイル)"
      ),
      maxResults: z.number().optional().describe("取得する最大ファイル数（デフォルト: 50、最大: 100）"),
      customQuery: z.string().optional().describe("カスタム検索クエリ（fileType='all'の場合のみ有効）")
    },
    async ({ fileType, maxResults = 50, customQuery }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) {
          return authError;
        }

        const driveService = new DriveService(auth);
        const { files, responseKey } = await driveService.listFilesByType(fileType as FileType, maxResults, customQuery);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                fileType: fileType,
                totalCount: files.length,
                [responseKey]: files
              }, null, 2)
            }
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `ファイル一覧取得に失敗しました: ${error.message || String(error)}`
            }
          ],
          isError: true
        };
      }
    }
  );
} 