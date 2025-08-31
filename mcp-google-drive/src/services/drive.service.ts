import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { FileInfo, FileType } from "../types/index.js";
import { PdfService } from "./pdf.service.js";
import { SheetsService } from "./sheets.service.js";
import { DocsService } from "./docs.service.js";
import { SlidesService } from "./slides.service.js";

export class DriveService {
  constructor(private auth: OAuth2Client) {}

  // Googleドライブのファイル一覧を取得する関数
  async listFiles(query?: string): Promise<FileInfo[]> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    
    try {
      const params: any = {
        pageSize: 50,
        fields: "files(id, name, mimeType, createdTime, modifiedTime, webViewLink, iconLink)",
      };
      
      if (query) {
        params.q = query;
      }
      
      const response = await drive.files.list(params);
      return response.data.files || [];
    } catch (error) {
      console.error("Googleドライブのファイル一覧取得エラー:", error);
      throw error;
    }
  }

  // Google Driveでファイルを検索する関数
  async searchFiles(query: string, maxResults: number = 10): Promise<FileInfo[]> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    
    try {
      // ドキュメント、スプレッドシート、スライドのMIMEタイプを指定
      const mimeTypes = [
        "application/vnd.google-apps.document",      // Google Docs
        "application/vnd.google-apps.spreadsheet",   // Google Sheets
        "application/vnd.google-apps.presentation"   // Google Slides
      ];
      
      // クエリをエスケープ
      const escapedQuery = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      
      // 検索クエリを構築（ファイル名とコンテンツの両方を検索対象とする）
      const mimeTypeQuery = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');
      const searchQuery = `(${mimeTypeQuery}) and (name contains '${escapedQuery}' or fullText contains '${escapedQuery}') and trashed=false`;
      
      const params = {
        q: searchQuery,
        pageSize: Math.min(maxResults, 20), // 最大20件に制限
        fields: "files(id, name, mimeType, createdTime, modifiedTime, webViewLink, iconLink)",
        orderBy: "modifiedTime desc" // 更新日時の降順でソート
      };
      
      const response = await drive.files.list(params);
      return response.data.files || [];
    } catch (error) {
      console.error("Googleドライブのファイル検索エラー:", error);
      throw error;
    }
  }

  // ファイルタイプ別にファイル一覧を取得
  async listFilesByType(fileType: FileType, maxResults: number = 50, customQuery?: string): Promise<{
    files: FileInfo[];
    responseKey: string;
    useSpecialHandling: boolean;
  }> {
    let query: string;
    let responseKey: string;
    let useSpecialHandling = false;

    switch (fileType) {
      case 'sheets':
        query = "mimeType='application/vnd.google-apps.spreadsheet'";
        responseKey = 'spreadsheets';
        break;
      case 'docs':
        query = "mimeType='application/vnd.google-apps.document'";
        responseKey = 'documents';
        break;
      case 'presentations':
        query = "mimeType='application/vnd.google-apps.presentation'";
        responseKey = 'presentations';
        break;
      case 'pdf':
        query = "mimeType='application/pdf' and trashed=false";
        responseKey = 'files';
        useSpecialHandling = true;
        break;
      case 'all':
      default:
        query = customQuery || '';
        responseKey = 'files';
        break;
    }

    let files: FileInfo[];

    if (fileType === 'pdf' && useSpecialHandling) {
      // PDF専用の処理
      const pdfService = new PdfService(this.auth);
      const result = await pdfService.listPdfFiles(maxResults);
      if (result.status === 'error') {
        throw new Error(`PDFファイル一覧の取得に失敗しました: ${result.error}`);
      }
      files = result.files || [];
    } else {
      // 標準の処理
      files = await this.listFiles(query);
      
      // maxResultsの制限を適用
      if (maxResults && maxResults < files.length) {
        files = files.slice(0, Math.min(maxResults, 100));
      }
    }

    return { files, responseKey, useSpecialHandling };
  }

  // 統合的なファイル内容読み取り機能
  async readFileContent(fileId: string, fileType: 'docs' | 'sheets' | 'presentations' | 'pdf'): Promise<{
    status: string;
    fileId: string;
    fileType: string;
    content: any;
  }> {
    try {
      let content: any;

      switch (fileType) {
        case 'docs':
          const docsService = new DocsService(this.auth);
          content = await docsService.getDocText(fileId);
          break;

        case 'sheets':
          const sheetsService = new SheetsService(this.auth);
          content = await sheetsService.getSpreadsheetText(fileId);
          break;

        case 'presentations':
          const slidesService = new SlidesService(this.auth);
          content = await slidesService.getPresentationText(fileId);
          break;

        case 'pdf':
          const pdfService = new PdfService(this.auth);
          const pdfResult = await pdfService.extractPdfText(fileId);
          content = pdfResult;
          break;

        default:
          throw new Error(`サポートされていないファイルタイプです: ${fileType}`);
      }

      return {
        status: 'success',
        fileId,
        fileType,
        content
      };
    } catch (error) {
      console.error(`ファイル内容読み取りエラー (${fileType}):`, error);
      throw error;
    }
  }

  // 統合的なファイルコメント取得機能
  async getFileComments(fileId: string, fileType: 'docs' | 'sheets' | 'presentations'): Promise<{
    status: string;
    fileId: string;
    fileType: string;
    comments: any;
  }> {
    try {
      let comments: any;

      switch (fileType) {
        case 'docs':
          const docsService = new DocsService(this.auth);
          comments = await docsService.getDocumentComments(fileId);
          break;

        case 'sheets':
          const sheetsService = new SheetsService(this.auth);
          comments = await sheetsService.getSpreadsheetComments(fileId);
          break;

        case 'presentations':
          const slidesService = new SlidesService(this.auth);
          comments = await slidesService.getPresentationComments(fileId);
          break;

        default:
          throw new Error(`サポートされていないファイルタイプです: ${fileType}`);
      }

      return {
        status: 'success',
        fileId,
        fileType,
        comments
      };
    } catch (error) {
      console.error(`ファイルコメント取得エラー (${fileType}):`, error);
      throw error;
    }
  }

  // ファイル詳細読み取り機能（ページ単位）
  async getFileDetail(
    fileId: string, 
    fileType: 'docs' | 'sheets' | 'presentations',
    options: {
      tabId?: string;      // ドキュメント用
      range?: string;      // スプレッドシート用
      pageNumber?: number; // スライド用
    }
  ): Promise<{
    status: string;
    fileId: string;
    fileType: string;
    data: any;
  }> {
    try {
      let data: any;

      switch (fileType) {
        case 'docs':
          if (!options.tabId) {
            throw new Error('ドキュメントの詳細読み取りにはタブIDが必要です');
          }
          const docsService = new DocsService(this.auth);
          data = await docsService.getDocumentTabText(fileId, options.tabId);
          break;

        case 'sheets':
          const sheetsService = new SheetsService(this.auth);
          if (!options.range) {
            // 範囲指定がない場合は、シート一覧を取得して最初のシートの全データ範囲を使用
            const sheets = await sheetsService.getSpreadsheetSheets(fileId);
            if (sheets.length === 0) {
              throw new Error('スプレッドシートにシートが存在しません');
            }
            const firstSheetTitle = sheets[0].title;
            const autoRange = await sheetsService.getSheetDataRange(fileId, firstSheetTitle);
            data = {
              range: autoRange,
              values: await sheetsService.getSheetValues(fileId, autoRange),
              message: `範囲未指定のため、シート "${firstSheetTitle}" の全データ範囲 "${autoRange}" を取得しました`
            };
          } else {
            // 範囲指定がある場合
            // シート名のみ指定（例: "Sheet1"）の場合は全データ範囲を取得
            if (!options.range.includes('!')) {
              // シート名のみの場合
              const sheetResult = await sheetsService.getSheetByName(fileId, options.range);
              data = {
                range: sheetResult.range,
                values: sheetResult.values,
                message: `シート "${options.range}" の全データ範囲 "${sheetResult.range}" を取得しました`
              };
            } else {
              // 通常の範囲指定の場合
              data = {
                range: options.range,
                values: await sheetsService.getSheetValues(fileId, options.range)
              };
            }
          }
          break;

        case 'presentations':
          if (!options.pageNumber) {
            throw new Error('スライドの詳細読み取りにはページ番号が必要です');
          }
          const slidesService = new SlidesService(this.auth);
          data = await slidesService.getSlideByPageNumber(fileId, options.pageNumber);
          break;

        default:
          throw new Error(`サポートされていないファイルタイプです: ${fileType}`);
      }

      return {
        status: 'success',
        fileId,
        fileType,
        data
      };
    } catch (error) {
      console.error(`ファイル詳細読み取りエラー (${fileType}):`, error);
      throw error;
    }
  }

  // 統合的なグラフ作成機能
  async createChart(
    fileId: string,
    fileType: 'docs' | 'sheets' | 'presentations',
    chartType: 'COLUMN' | 'LINE' | 'PIE' | 'BAR' | 'SCATTER',
    options: {
      // 共通オプション
      title?: string;
      
      // ドキュメント用オプション
      sourceSheetId?: string;  // ドキュメントの場合は必須
      sourceRange?: string;    // ドキュメントの場合は必須
      insertIndex?: number;    // ドキュメントの場合
      
      // スプレッドシート用オプション
      sheetId?: number;        // スプレッドシートの場合は必須
      dataRange?: string;      // スプレッドシートの場合は必須
      position?: { row: number; column: number }; // スプレッドシートの場合
      
      // スライド用オプション
      slideIndex?: number;     // スライドの場合は必須
      bounds?: { x: number; y: number; width: number; height: number }; // スライドの場合
      existingChartId?: number; // 既存のチャートIDを指定する場合
      
      // 軸タイトルオプション（スプレッドシート用）
      xAxisTitle?: string;     // X軸のタイトル
      yAxisTitle?: string;     // Y軸のタイトル
    }
  ): Promise<{
    status: string;
    fileId: string;
    fileType: string;
    chartType: string;
    result: any;
  }> {
    try {
      let result: any;

      switch (fileType) {
        case 'docs':
          if (!options.sourceSheetId || !options.sourceRange) {
            throw new Error('ドキュメントへのグラフ作成には sourceSheetId と sourceRange が必要です');
          }
          const docsService = new DocsService(this.auth);
          result = await docsService.createChartInDoc(
            fileId,
            chartType,
            options.sourceSheetId,
            options.sourceRange,
            options.title,
            options.insertIndex
          );
          break;

        case 'sheets':
          if (options.sheetId === undefined || !options.dataRange) {
            throw new Error('スプレッドシートへのグラフ作成には sheetId と dataRange が必要です');
          }
          const sheetsService = new SheetsService(this.auth);
          result = await sheetsService.createChartInSheet(
            fileId,
            options.sheetId,
            chartType,
            options.dataRange,
            options.title,
            options.position,
            {
              xAxisTitle: options.xAxisTitle,
              yAxisTitle: options.yAxisTitle
            }
          );
          break;

        case 'presentations':
          if (options.slideIndex === undefined || !options.sourceSheetId || !options.sourceRange) {
            throw new Error('スライドへのグラフ作成には slideIndex、sourceSheetId、sourceRange が必要です');
          }
          const slidesService = new SlidesService(this.auth);
          
          // 既存のチャートIDが指定されている場合は、それを使用してリンク
          if (options.existingChartId) {
            result = await slidesService.linkExistingChartToSlide(
              fileId,
              options.slideIndex,
              options.sourceSheetId,
              options.existingChartId,
              options.bounds
            );
          } else {
            // 新しいチャートを作成
            result = await slidesService.createChartInSlide(
              fileId,
              options.slideIndex,
              chartType,
              options.sourceSheetId,
              options.sourceRange,
              options.title,
              options.bounds,
              options.existingChartId
            );
          }
          break;

        default:
          throw new Error(`サポートされていないファイルタイプです: ${fileType}`);
      }

      return {
        status: 'success',
        fileId,
        fileType,
        chartType,
        result
      };
    } catch (error) {
      console.error(`グラフ作成エラー (${fileType}):`, error);
      return {
        status: 'error',
        fileId,
        fileType,
        chartType,
        result: {
          error: error instanceof Error ? error.message : 'グラフ作成に失敗しました'
        }
      };
    }
  }

  // 統合的な新規作成機能
  async createNew(
    fileId: string,
    fileType: 'docs' | 'sheets' | 'presentations',
    title: string
  ): Promise<{
    status: string;
    fileId: string;
    fileType: string;
    title: string;
    result: any;
  }> {
    try {
      let result: any;

      switch (fileType) {
        case 'docs':
          const docsService = new DocsService(this.auth);
          result = await docsService.createNewTab(fileId, title);
          break;

        case 'sheets':
          const sheetsService = new SheetsService(this.auth);
          result = await sheetsService.createNewSheet(fileId, title);
          break;

        case 'presentations':
          const slidesService = new SlidesService(this.auth);
          result = await slidesService.createNewSlide(fileId, title);
          break;

        default:
          throw new Error(`サポートされていないファイルタイプです: ${fileType}`);
      }

      return {
        status: 'success',
        fileId,
        fileType,
        title,
        result
      };
    } catch (error) {
      console.error(`新規作成エラー (${fileType}):`, error);
      return {
        status: 'error',
        fileId,
        fileType,
        title,
        result: {
          error: error instanceof Error ? error.message : '新規作成に失敗しました'
        }
      };
    }
  }

  // 統合的な部分コピー機能
  async copyPart(
    fileId: string,
    fileType: 'docs' | 'sheets' | 'presentations',
    sourcePartId: string,
    newPartName?: string
  ): Promise<{
    status: string;
    fileId: string;
    fileType: string;
    sourcePartId: string;
    newPartName?: string;
    result: any;
  }> {
    try {
      let result: any;

      switch (fileType) {
        case 'docs':
          const docsService = new DocsService(this.auth);
          result = await docsService.copyPart(fileId, sourcePartId, newPartName);
          break;

        case 'sheets':
          const sheetsService = new SheetsService(this.auth);
          // スプレッドシートの場合、sourcePartIdはsheetIdとして扱う
          const sourceSheetId = parseInt(sourcePartId, 10);
          if (isNaN(sourceSheetId)) {
            throw new Error(`無効なシートID: ${sourcePartId}`);
          }
          result = await sheetsService.copySheet(fileId, sourceSheetId, newPartName);
          break;

        case 'presentations':
          const slidesService = new SlidesService(this.auth);
          result = await slidesService.copySlide(fileId, sourcePartId, newPartName);
          break;

        default:
          throw new Error(`サポートされていないファイルタイプです: ${fileType}`);
      }

      return {
        status: 'success',
        fileId,
        fileType,
        sourcePartId,
        newPartName,
        result
      };
    } catch (error) {
      console.error(`部分コピーエラー (${fileType}):`, error);
      return {
        status: 'error',
        fileId,
        fileType,
        sourcePartId,
        newPartName,
        result: {
          error: error instanceof Error ? error.message : '部分コピーに失敗しました'
        }
      };
    }
  }
} 