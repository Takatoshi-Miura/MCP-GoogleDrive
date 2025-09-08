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
    "Retrieve a list of Google Drive files of a specified type",
    {
      fileType: z.enum(['all', 'sheets', 'docs', 'presentations', 'pdf']).describe(
        "Type of files to retrieve: 'all' (all files), 'sheets' (spreadsheets), 'docs' (documents), 'presentations' (slides), 'pdf' (PDF files)"
      ),
      maxResults: z.number().optional().describe("Maximum number of files to retrieve (default: 50, max: 100)"),
      customQuery: z.string().optional().describe("Custom search query (only effective when fileType='all')")
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

  // Google Driveファイル検索ツール（基本検索）
  server.tool(
    "g_drive_search_files",
    "Search for files in Google Drive",
    {
      query: z.string().describe("Search query")
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
    "Read the contents of a Google Drive file (supports documents, spreadsheets, slides, and PDFs)",
    {
      fileId: z.string().describe("ID of the file to read"),
      fileType: z.enum(['docs', 'sheets', 'presentations', 'pdf']).describe(
        "File type: 'docs' (documents), 'sheets' (spreadsheets), 'presentations' (slides), 'pdf' (PDF files)"
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
    "Retrieve comments from Google Drive files (supports documents, spreadsheets, and slides)",
    {
      fileId: z.string().describe("ID of the file to retrieve comments from"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "File type: 'docs' (documents), 'sheets' (spreadsheets), 'presentations' (slides)"
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
    "Read file contents in detail page by page (supports documents, spreadsheets, and slides)",
    {
      fileId: z.string().describe("ID of the file to read"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "File type: 'docs' (documents), 'sheets' (spreadsheets), 'presentations' (slides)"
      ),
      tabId: z.string().optional().describe("For documents: ID of the tab to read"),
      range: z.string().optional().describe("For spreadsheets: range to read (e.g., Sheet1!A1:B10)"),
      pageNumber: z.number().optional().describe("For slides: page number to read (starting from 1)")
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
    "Insert values into documents, spreadsheets, or slides (calls the appropriate tool based on file type)",
    {
      fileId: z.string().describe("ID of the target file for insertion"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe("File type: 'docs' (documents), 'sheets' (spreadsheets), 'presentations' (slides)"),
      // ドキュメント用パラメータ
      tabId: z.string().optional().describe("For documents: target tab ID (defaults to first tab if omitted)"),
      location: z.number().optional().describe("For documents: insertion position (character index, -1 for automatic insertion at end)"),
      text: z.string().optional().describe("For documents and slides: text to insert"),
      // スプレッドシート用パラメータ
      range: z.string().optional().describe("For spreadsheets: insertion range (e.g., Sheet1!A1)"),
      values: z.array(z.array(z.any())).optional().describe("For spreadsheets: 2D array of values to insert"),
      insertPosition: z.number().optional().describe("For spreadsheets: row number to insert (starting from 1, defaults to end if omitted)"),
      // スライド用パラメータ
      slideIndex: z.number().optional().describe("For slides: target slide index (starting from 0)"),
      bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      }).optional().describe("For slides: position and size of text box"),
    },
    async ({ fileId, fileType, tabId, location, text, range, values, insertPosition, slideIndex, bounds }) => {
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
          const result = await docsService.insertTextToDoc(fileId, location, text, tabId);
          
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
        // ドキュメントの位置エラーの場合は詳細な情報を提供
        if (fileType === 'docs' && error.message && error.message.includes('位置')) {
          return createErrorResponse("ドキュメントへの値挿入に失敗しました", error, {
            tip: "挿入位置を確認してください。location: -1 で末尾に自動挿入できます。",
            fileType: fileType,
            requestedLocation: location,
            requestedTabId: tabId
          });
        }
        
        return createErrorResponse("ファイルへの値挿入に失敗しました", error);
      }
    }
  );

  // ファイル構造取得ツール
  server.tool(
    "g_drive_get_file_structure",
    "Get file structure (supports documents and spreadsheets)",
    {
      fileId: z.string().describe("File ID"),
      fileType: z.enum(['docs', 'sheets']).describe("File type: 'docs' (documents), 'sheets' (spreadsheets)")
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
    "Create a chart in the specified file (supports documents, spreadsheets, and slides)",
    {
      fileId: z.string().describe("ID of the file to create chart in"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "File type: 'docs' (documents), 'sheets' (spreadsheets), 'presentations' (slides)"
      ),
      chartType: z.enum(['COLUMN', 'LINE', 'PIE', 'BAR', 'SCATTER']).describe(
        "Chart type: 'COLUMN' (vertical bar), 'LINE' (line), 'PIE' (pie), 'BAR' (horizontal bar), 'SCATTER' (scatter plot)"
      ),
      title: z.string().optional().describe("Chart title"),
      
      // ドキュメント用パラメータ
      sourceSheetId: z.string().optional().describe("For documents and slides: ID of the spreadsheet to use as data source"),
      sourceRange: z.string().optional().describe("For documents and slides: range of data source (e.g., A1:B10)"),
      insertIndex: z.number().optional().describe("For documents: insertion position (character index)"),
      
      // スプレッドシート用パラメータ
      sheetId: z.number().optional().describe("For spreadsheets: target sheet ID"),
      dataRange: z.string().optional().describe("For spreadsheets: data range for chart (e.g., A1:B10)"),
      position: z.object({
        row: z.number(),
        column: z.number()
      }).optional().describe("For spreadsheets: chart placement position"),
      
      // スライド用パラメータ
      slideIndex: z.number().optional().describe("For slides: target slide index (starting from 0)"),
      bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      }).optional().describe("For slides: chart position and size"),
      existingChartId: z.number().optional().describe("For slides: link by specifying existing spreadsheet chart ID"),
      
      // 軸タイトルパラメータ（スプレッドシート用）
      xAxisTitle: z.string().optional().describe("For spreadsheets: X-axis title (auto-inferred if omitted)"),
      yAxisTitle: z.string().optional().describe("For spreadsheets: Y-axis title (auto-inferred if omitted)")
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
    "Create new elements in the specified file (Documents: tab creation unavailable due to API limitations, Spreadsheets: create new sheets, Slides: create new slides)",
    {
      fileId: z.string().describe("ID of the target file for new creation"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "File type: 'docs' (documents - create new tab), 'sheets' (spreadsheets - create new sheet), 'presentations' (slides - create new slide)"
      ),
      title: z.string().describe("Title of the new element to create (tab name, sheet name, slide title)")
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

  // 部分コピーツール
  server.tool(
    "g_drive_copy_element",
    "Copy parts of the specified file (supports spreadsheet sheet copying and slide copying)",
    {
      fileId: z.string().describe("ID of the target file to copy from"),
      fileType: z.enum(['docs', 'sheets', 'presentations']).describe(
        "File type: 'docs' (documents - not implemented), 'sheets' (spreadsheets - implemented), 'presentations' (slides - implemented)"
      ),
      sourcePartId: z.string().describe("Source part ID (for spreadsheets: sheet ID, for slides: slide ID)"),
      newPartName: z.string().optional().describe("Name of the new part (for spreadsheets: new sheet name, for slides: new slide name)")
    },
    async ({ fileId, fileType, sourcePartId, newPartName }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        const driveService = new DriveService(auth);
        const result = await driveService.copyPart(
          fileId,
          fileType as 'docs' | 'sheets' | 'presentations',
          sourcePartId,
          newPartName
        );

        return createSuccessResponse(result);
      } catch (error: any) {
        return createErrorResponse("部分コピーに失敗しました", error);
      }
    }
  );

  // セル結合ツール
  server.tool(
    "g_drive_merge_cell",
    "Merge specified cell ranges in spreadsheets",
    {
      fileId: z.string().describe("ID of the spreadsheet file"),
      fileType: z.enum(['sheets']).describe("File type: 'sheets' (spreadsheets only)"),
      range: z.string().describe("Cell range to merge (e.g., Sheet1!A1:B2)")
    },
    async ({ fileId, fileType, range }) => {
      try {
        const auth = await getAuthClient();
        const authError = checkAuthAndReturnError(auth);
        if (authError) return authError;

        // スプレッドシートのみサポート
        if (fileType !== 'sheets') {
          return createUnsupportedFileTypeError(fileType);
        }

        const sheetsService = new SheetsService(auth);
        const result = await sheetsService.mergeCells(fileId, range);

        return createSuccessResponse(result);
      } catch (error: any) {
        return createErrorResponse("セル結合に失敗しました", error);
      }
    }
  );
} 