import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { createRequire } from "module";

// CommonJSモジュールを読み込むためのrequire関数を作成
const require = createRequire(import.meta.url);

export class PdfService {
  constructor(private auth: OAuth2Client) {}

  /**
   * GoogleドライブのPDFファイルからテキストを抽出する関数
   * @param fileId PDFファイルのID
   * @returns 抽出されたテキスト情報
   */
  async extractPdfText(fileId: string): Promise<{
    status: string;
    fileId: string;
    fileName?: string;
    mimeType?: string;
    text?: string;
    pageCount?: number;
    error?: string;
  }> {
    try {
      const drive = google.drive({ version: "v3", auth: this.auth });
      
      // まずファイル情報を取得してPDFファイルかどうか確認
      const fileInfo = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,size"
      });
      
      const file = fileInfo.data;
      
      // PDFファイルかどうかチェック
      if (file.mimeType !== "application/pdf") {
        return {
          status: "error",
          fileId,
          fileName: file.name || "不明",
          mimeType: file.mimeType || "不明",
          error: `指定されたファイルはPDFファイルではありません。MIMEタイプ: ${file.mimeType}`
        };
      }
      
      // PDFファイルのバイナリデータを取得
      const response = await drive.files.get({
        fileId,
        alt: "media"
      }, {
        responseType: "arraybuffer"
      });
      
      // PDFデータをBufferに変換
      const pdfBuffer = Buffer.from(response.data as ArrayBuffer);
      
      // pdf-parseを使用してテキストを抽出
      try {
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(pdfBuffer);
        
        return {
          status: "success",
          fileId,
          fileName: file.name || "不明",
          mimeType: file.mimeType || "application/pdf",
          text: pdfData.text,
          pageCount: pdfData.numpages
        };
      } catch (parseError: any) {
        console.error("PDF解析エラー:", parseError);
        return {
          status: "error",
          fileId,
          fileName: file.name || "不明",
          mimeType: file.mimeType || "application/pdf",
          error: `PDFの解析に失敗しました: ${parseError.message}`
        };
      }
      
    } catch (error: any) {
      console.error("PDFテキスト抽出エラー:", error);
      
      return {
        status: "error",
        fileId,
        error: error.message || "PDFテキストの抽出に失敗しました"
      };
    }
  }

  /**
   * GoogleドライブのPDFファイル一覧を取得する関数
   * @param maxResults 取得する最大ファイル数（デフォルト: 50）
   * @returns PDFファイルの一覧
   */
  async listPdfFiles(maxResults: number = 50): Promise<{
    status: string;
    files?: Array<{
      id: string;
      name: string;
      createdTime: string;
      modifiedTime: string;
      size?: string;
      webViewLink?: string;
    }>;
    totalCount?: number;
    error?: string;
  }> {
    try {
      const drive = google.drive({ version: "v3", auth: this.auth });
      
      const response = await drive.files.list({
        q: "mimeType='application/pdf' and trashed=false",
        pageSize: Math.min(maxResults, 100), // Google APIの制限に合わせて最大100に制限
        fields: "files(id,name,createdTime,modifiedTime,size,webViewLink)",
        orderBy: "modifiedTime desc"
      });
      
      const files = response.data.files || [];
      
      return {
        status: "success",
        files: files.map(file => ({
          id: file.id || "",
          name: file.name || "不明",
          createdTime: file.createdTime || "",
          modifiedTime: file.modifiedTime || "",
          size: file.size,
          webViewLink: file.webViewLink
        })),
        totalCount: files.length
      };
      
    } catch (error: any) {
      console.error("PDFファイル一覧取得エラー:", error);
      
      return {
        status: "error",
        error: error.message || "PDFファイル一覧の取得に失敗しました"
      };
    }
  }
} 