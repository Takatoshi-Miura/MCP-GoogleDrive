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

        // ファイル名をマークダウンリンク形式に変換
        const filesWithMarkdownLinks = files.map(file => ({
          ...file,
          name: file.webViewLink ? `[${file.name}](${file.webViewLink})` : file.name
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                fileType: fileType,
                totalCount: filesWithMarkdownLinks.length,
                [responseKey]: filesWithMarkdownLinks
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

  // Google Driveファイル検索（内容分析付き）ツール
  server.tool(
    "g_drive_search_files_with_analysis",
    "Google Drive内のファイルを検索し、ファイルの内容を分析して関連度の高い順に並び替えて返します。各ファイルの要約と関連度スコアも含まれます。",
    {
      query: z.string().describe("検索クエリ（自然言語で入力可能。例：「プロジェクト計画について」「会議の議事録」「予算に関する資料」など）"),
      maxResults: z.number().optional().describe("最大結果数（デフォルト: 10、最大: 20）")
    },
    async ({ query, maxResults = 10 }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) {
          return authError;
        }

        const driveService = new DriveService(auth);
        const analysisResult = await driveService.searchFilesWithContentAnalysis(query, maxResults);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                query: analysisResult.query,
                totalCount: analysisResult.totalCount,
                results: analysisResult.results.map(file => ({
                  id: file.id,
                  name: `[${file.name}](${file.link})`,
                  link: file.link,
                  type: file.type,
                  modifiedTime: file.modifiedTime,
                  relevanceScore: file.relevanceScore,
                  summary: file.summary
                }))
              }, null, 2)
            }
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `内容分析付きファイル検索に失敗しました: ${error.message || String(error)}`
            }
          ],
          isError: true
        };
      }
    }
  );
} 