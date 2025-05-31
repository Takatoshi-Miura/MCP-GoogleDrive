import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { FileInfo, FileType } from "../types/index.js";
import { PdfService } from "./pdf.service.js";

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
} 