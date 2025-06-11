import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { DriveService } from "../services/drive.service.js";
import { DocsService } from "../services/docs.service.js";
import { SheetsService } from "../services/sheets.service.js";
import { SlidesService } from "../services/slides.service.js";
import { FileType } from "../types/index.js";
import { 
  checkAuthAndReturnError, 
  createSuccessResponse, 
  createErrorResponse, 
  createMissingParametersError,
  createUnsupportedFileTypeError 
} from "./common.js";

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
        if (authError) return authError;

        const driveService = new DriveService(auth);
        const { files, responseKey } = await driveService.listFilesByType(fileType as FileType, maxResults, customQuery);

        // ファイル名をマークダウンリンク形式に変換
        const filesWithMarkdownLinks = files.map(file => ({
          ...file,
          name: file.webViewLink ? `[${file.name}](${file.webViewLink})` : file.name
        }));

        return createSuccessResponse({
          status: "success",
          fileType: fileType,
          totalCount: filesWithMarkdownLinks.length,
          [responseKey]: filesWithMarkdownLinks
        });
      } catch (error: any) {
        return createErrorResponse("ファイル一覧取得に失敗しました", error);
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
        if (authError) return authError;

        const driveService = new DriveService(auth);
        const analysisResult = await driveService.searchFilesWithContentAnalysis(query, maxResults);

        return createSuccessResponse({
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
        });
      } catch (error: any) {
        return createErrorResponse("内容分析付きファイル検索に失敗しました", error);
      }
    }
  );

  // Google Driveファイル検索ツール（基本検索）
  server.tool(
    "g_drive_search_files",
    "Google Drive内のファイルを検索する",
    {
      query: z.string().describe("検索クエリ")
    },
    async ({ query }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const driveService = new DriveService(auth);
        
        // DriveService.searchFilesに直接検索クエリを渡す
        const files = await driveService.searchFiles(query);

        // ファイルリストをマークダウンリンク形式で作成
        const fileList = files
          ?.map((file: any) => {
            const fileName = file.name || '名前なし';
            const mimeType = file.mimeType || 'unknown';
            const webViewLink = file.webViewLink;
            
            // webViewLinkがある場合はクリック可能なリンクにする
            if (webViewLink) {
              return `[${fileName}](${webViewLink}) (${mimeType})`;
            } else {
              return `${fileName} (${mimeType})`;
            }
          })
          .join("\n");

        return createSuccessResponse({
          status: "success",
          query: query,
          totalCount: files?.length ?? 0,
          results: `Found ${files?.length ?? 0} files:\n${fileList}`,
        });
      } catch (error: any) {
        return createErrorResponse("ファイル検索に失敗しました", error);
      }
    }
  );

  // 統合的なファイル内容読み取りツール
  server.tool(
    "g_drive_read_file",
    "GoogleDriveのファイル内容を読み取る（ドキュメント、スプレッドシート、スライド、PDF対応）",
    {
      fileId: z.string().describe("読み取るファイルのID"),
      fileType: z.enum(['docs', 'sheets', 'presentations', 'pdf']).describe(
        "ファイルの種類: 'docs'(ドキュメント), 'sheets'(スプレッドシート), 'presentations'(スライド), 'pdf'(PDFファイル)"
      )
    },
    async ({ fileId, fileType }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const driveService = new DriveService(auth);
        const result = await driveService.readFileContent(fileId, fileType as 'docs' | 'sheets' | 'presentations' | 'pdf');

        return createSuccessResponse(result);
      } catch (error: any) {
        return createErrorResponse("ファイル内容の読み取りに失敗しました", error);
      }
    }
  );

  // 統合的なファイルコメント取得ツール
  server.tool(
    "g_drive_get_comments",
    "GoogleDriveのファイルコメントを取得する（ドキュメント、スプレッドシート、スライド対応）",
    {
      fileId: z.string().describe("コメントを取得するファイルのID"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "ファイルの種類: 'docs'(ドキュメント), 'sheets'(スプレッドシート), 'presentations'(スライド)"
      )
    },
    async ({ fileId, fileType }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const driveService = new DriveService(auth);
        const result = await driveService.getFileComments(fileId, fileType as 'docs' | 'sheets' | 'presentations');

        return createSuccessResponse(result);
      } catch (error: any) {
        return createErrorResponse("ファイルコメントの取得に失敗しました", error);
      }
    }
  );

  // ファイル詳細読み取りツール（ページ単位）
  server.tool(
    "g_drive_read_file_part",
    "ファイルを1ページ単位で詳細に読み取る（ドキュメント、スプレッドシート、スライド対応）",
    {
      fileId: z.string().describe("読み取るファイルのID"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "ファイルの種類: 'docs'(ドキュメント), 'sheets'(スプレッドシート), 'presentations'(スライド)"
      ),
      tabId: z.string().optional().describe("ドキュメントの場合：読み取るタブのID"),
      range: z.string().optional().describe("スプレッドシートの場合：読み取る範囲（例: Sheet1!A1:B10）"),
      pageNumber: z.number().optional().describe("スライドの場合：読み取るページ番号（1から開始）")
    },
    async ({ fileId, fileType, tabId, range, pageNumber }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const options: { tabId?: string; range?: string; pageNumber?: number } = {};
        if (tabId) options.tabId = tabId;
        if (range) options.range = range;
        if (pageNumber) options.pageNumber = pageNumber;

        const driveService = new DriveService(auth);
        const result = await driveService.getFileDetail(
          fileId, 
          fileType as 'docs' | 'sheets' | 'presentations',
          options
        );

        return createSuccessResponse(result);
      } catch (error: any) {
        return createErrorResponse("ファイル詳細読み取りに失敗しました", error);
      }
    }
  );

  // 統合的なファイル値挿入ツール
  server.tool(
    "g_drive_insert_value",
    "ドキュメント、スプレッドシート、またはスライドに値を挿入する（ファイル種別に応じて適切なツールを呼び出し）",
    {
      fileId: z.string().describe("挿入対象ファイルのID"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe("ファイルの種類: 'docs'(ドキュメント), 'sheets'(スプレッドシート), 'presentations'(スライド)"),
      // ドキュメント用パラメータ
      location: z.number().optional().describe("ドキュメントの場合：挿入位置（文字インデックス）"),
      text: z.string().optional().describe("ドキュメント・スライドの場合：挿入するテキスト"),
      // スプレッドシート用パラメータ
      range: z.string().optional().describe("スプレッドシートの場合：挿入範囲（例: Sheet1!A1）"),
      values: z.array(z.array(z.any())).optional().describe("スプレッドシートの場合：挿入する値の2次元配列"),
      insertPosition: z.number().optional().describe("スプレッドシートの場合：挿入する行番号（1から開始、省略時は末尾に追加）"),
      // スライド用パラメータ
      slideIndex: z.number().optional().describe("スライドの場合：対象スライドのインデックス（0から開始）"),
      bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      }).optional().describe("スライドの場合：テキストボックスの位置とサイズ"),
    },
    async ({ fileId, fileType, location, text, range, values, insertPosition, slideIndex, bounds }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        if (fileType === 'docs') {
          // ドキュメントの場合
          if (location === undefined || text === undefined) {
            return createMissingParametersError("ドキュメントへの挿入には location と text パラメータが必要です");
          }

          const docsService = new DocsService(auth);
          const result = await docsService.insertTextToDoc(fileId, location, text);
          
          return createSuccessResponse({
            status: "success",
            message: "ドキュメントにテキストを挿入しました",
            fileType: "docs",
            result
          });

        } else if (fileType === 'sheets') {
          // スプレッドシートの場合
          if (range === undefined || values === undefined) {
            return createMissingParametersError("スプレッドシートへの挿入には range と values パラメータが必要です");
          }

          const sheetsService = new SheetsService(auth);
          
          if (insertPosition) {
            // 指定位置に挿入
            await sheetsService.insertSheetValuesAtPosition(fileId, range, values, insertPosition);
            return createSuccessResponse({
              status: "success",
              message: `スプレッドシートの${insertPosition}行目に値を挿入しました`,
              fileType: "sheets"
            });
          } else {
            // 末尾に追加
            await sheetsService.appendSheetValues(fileId, range, values);
            return createSuccessResponse({
              status: "success",
              message: "スプレッドシートの末尾に値を追加しました",
              fileType: "sheets"
            });
          }

        } else if (fileType === 'presentations') {
          // スライドの場合
          if (slideIndex === undefined || text === undefined) {
            return createMissingParametersError("スライドへの挿入には slideIndex と text パラメータが必要です");
          }

          const slidesService = new SlidesService(auth);
          const result = await slidesService.insertTextToSlide(fileId, slideIndex, text, bounds);
          
          return createSuccessResponse({
            status: "success",
            message: "スライドにテキストを挿入しました",
            fileType: "presentations",
            result
          });
        }

        return createUnsupportedFileTypeError(fileType);

      } catch (error: any) {
        return createErrorResponse("ファイルへの値挿入に失敗しました", error);
      }
    }
  );

  // ファイル構造取得ツール
  server.tool(
    "g_drive_get_file_structure",
    "ファイルの構造を取得する（ドキュメント、スプレッドシート対応）",
    {
      fileId: z.string().describe("ファイルのID"),
      fileType: z.enum(['docs', 'sheets']).describe("ファイルの種類: 'docs'(ドキュメント), 'sheets'(スプレッドシート)")
    },
    async ({ fileId, fileType }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        if (fileType === 'docs') {
          // ドキュメントの場合：タブ一覧を取得
          const docsService = new DocsService(auth);
          const tabs = await docsService.getDocumentTabs(fileId);
          
          return createSuccessResponse({
            status: "success",
            fileType: "docs",
            fileId: fileId,
            structure: {
              tabs: tabs,
              tabCount: tabs.length
            }
          });

        } else if (fileType === 'sheets') {
          // スプレッドシートの場合：シート一覧を取得
          const sheetsService = new SheetsService(auth);
          const sheets = await sheetsService.getSpreadsheetSheets(fileId);
          
          return createSuccessResponse({
            status: "success",
            fileType: "sheets",
            fileId: fileId,
            structure: {
              sheets: sheets,
              sheetCount: sheets.length
            }
          });
        }

        return createUnsupportedFileTypeError(fileType);

      } catch (error: any) {
        return createErrorResponse("ファイル構造の取得に失敗しました", error);
      }
    }
  );

  // グラフ作成ツール
  server.tool(
    "g_drive_create_chart",
    "指定されたファイルにグラフを作成する（ドキュメント、スプレッドシート、スライド対応）",
    {
      fileId: z.string().describe("グラフを作成するファイルのID"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "ファイルの種類: 'docs'(ドキュメント), 'sheets'(スプレッドシート), 'presentations'(スライド)"
      ),
      chartType: z.enum(['COLUMN', 'LINE', 'PIE', 'BAR', 'SCATTER']).describe(
        "グラフの種類: 'COLUMN'(縦棒), 'LINE'(線), 'PIE'(円), 'BAR'(横棒), 'SCATTER'(散布図)"
      ),
      title: z.string().optional().describe("グラフのタイトル"),
      
      // ドキュメント用パラメータ
      sourceSheetId: z.string().optional().describe("ドキュメント・スライドの場合：データソースとなるスプレッドシートのID"),
      sourceRange: z.string().optional().describe("ドキュメント・スライドの場合：データソースの範囲（例: A1:B10）"),
      insertIndex: z.number().optional().describe("ドキュメントの場合：挿入位置（文字インデックス）"),
      
      // スプレッドシート用パラメータ
      sheetId: z.number().optional().describe("スプレッドシートの場合：対象シートのID"),
      dataRange: z.string().optional().describe("スプレッドシートの場合：グラフのデータ範囲（例: A1:B10）"),
      position: z.object({
        row: z.number(),
        column: z.number()
      }).optional().describe("スプレッドシートの場合：グラフの配置位置"),
      
      // スライド用パラメータ
      slideIndex: z.number().optional().describe("スライドの場合：対象スライドのインデックス（0から開始）"),
      bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      }).optional().describe("スライドの場合：グラフの位置とサイズ"),
      existingChartId: z.number().optional().describe("スライドの場合：既存のスプレッドシートチャートIDを指定してリンク"),
      
      // 軸タイトルパラメータ（スプレッドシート用）
      xAxisTitle: z.string().optional().describe("スプレッドシートの場合：X軸のタイトル（省略時は自動推定）"),
      yAxisTitle: z.string().optional().describe("スプレッドシートの場合：Y軸のタイトル（省略時は自動推定）")
    },
    async ({ 
      fileId, 
      fileType, 
      chartType, 
      title,
      sourceSheetId,
      sourceRange,
      insertIndex,
      sheetId,
      dataRange,
      position,
      slideIndex,
      bounds,
      existingChartId,
      xAxisTitle,
      yAxisTitle
    }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        // ファイルタイプ別のパラメータ検証
        if (fileType === 'docs') {
          if (!sourceSheetId || !sourceRange) {
            return createMissingParametersError("ドキュメントへのグラフ作成には sourceSheetId と sourceRange が必要です");
          }
        } else if (fileType === 'sheets') {
          if (sheetId === undefined || !dataRange) {
            return createMissingParametersError("スプレッドシートへのグラフ作成には sheetId と dataRange が必要です");
          }
        } else if (fileType === 'presentations') {
          if (slideIndex === undefined || !sourceSheetId || !sourceRange) {
            return createMissingParametersError("スライドへのグラフ作成には slideIndex、sourceSheetId、sourceRange が必要です");
          }
        }

        const options: any = {
          title,
          sourceSheetId,
          sourceRange,
          insertIndex,
          sheetId,
          dataRange,
          position,
          slideIndex,
          bounds,
          existingChartId,
          xAxisTitle,
          yAxisTitle
        };

        const driveService = new DriveService(auth);
        const result = await driveService.createChart(
          fileId,
          fileType as 'docs' | 'sheets' | 'presentations',
          chartType,
          options
        );

        return createSuccessResponse(result);
      } catch (error: any) {
        return createErrorResponse("グラフ作成に失敗しました", error);
      }
    }
  );

  // 新規作成ツール（タブ、シート、スライド）
  server.tool(
    "g_drive_create_new_element",
    "指定されたファイルに新規要素を作成する（ドキュメント：API制限によりタブ作成不可、スプレッドシート：新規シート作成、スライド：新規スライド作成）",
    {
      fileId: z.string().describe("新規作成対象ファイルのID"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "ファイルの種類: 'docs'(ドキュメント - 新規タブ作成), 'sheets'(スプレッドシート - 新規シート作成), 'presentations'(スライド - 新規スライド作成)"
      ),
      title: z.string().describe("新規作成する要素のタイトル（タブ名、シート名、スライドタイトル）")
    },
    async ({ fileId, fileType, title }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const driveService = new DriveService(auth);
        const result = await driveService.createNew(
          fileId,
          fileType as 'docs' | 'sheets' | 'presentations',
          title
        );

        return createSuccessResponse(result);
      } catch (error: any) {
        return createErrorResponse("新規作成に失敗しました", error);
      }
    }
  );
} 