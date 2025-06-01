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
      
      // 検索クエリを構築（ファイル名とコンテンツの両方を検索対象とする）
      const mimeTypeQuery = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');
      const searchQuery = `(${mimeTypeQuery}) and (name contains '${query}' or fullText contains '${query}') and trashed=false`;
      
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

  // 検索結果を内容分析して関連度順に並び替える関数
  async searchFilesWithContentAnalysis(query: string, maxResults: number = 10): Promise<{
    query: string;
    totalCount: number;
    results: Array<{
      id: string;
      name: string;
      link: string;
      type: string;
      modifiedTime: string;
      relevanceScore: number;
      summary: string;
    }>;
  }> {
    try {
      // まず基本的な検索を実行
      const searchResults = await this.searchFiles(query, maxResults);
      
      if (searchResults.length === 0) {
        return {
          query,
          totalCount: 0,
          results: []
        };
      }

      // 各ファイルの内容を取得して関連度を計算
      const analyzedResults = await Promise.all(
        searchResults.map(async (file) => {
          try {
            let content = '';
            let type = '';
            
            // ファイルタイプに応じて内容を取得
            switch (file.mimeType) {
              case 'application/vnd.google-apps.document':
                const docsService = new DocsService(this.auth);
                const docContent = await docsService.getDocContent(file.id!);
                content = docContent.tabs.map(tab => tab.text || '').join(' ');
                type = 'Google Document';
                break;
                
              case 'application/vnd.google-apps.spreadsheet':
                const sheetsService = new SheetsService(this.auth);
                content = await sheetsService.getSpreadsheetText(file.id!);
                type = 'Google Spreadsheet';
                break;
                
              case 'application/vnd.google-apps.presentation':
                const slidesService = new SlidesService(this.auth);
                content = await slidesService.getPresentationText(file.id!);
                type = 'Google Slides';
                break;
                
              default:
                content = file.name || '';
                type = 'Unknown';
            }

            // 関連度スコアを計算
            const relevanceScore = this.calculateRelevanceScore(query, file.name || '', content);
            
            // 要約を生成
            const summary = this.generateSummary(content, file.name || '');

            return {
              id: file.id!,
              name: file.name!,
              link: file.webViewLink!,
              type,
              modifiedTime: file.modifiedTime!,
              relevanceScore,
              summary
            };
          } catch (error) {
            console.error(`ファイル ${file.name} の内容取得エラー:`, error);
            // エラーが発生した場合は基本情報のみで低いスコアを設定
            return {
              id: file.id!,
              name: file.name!,
              link: file.webViewLink!,
              type: 'Error',
              modifiedTime: file.modifiedTime!,
              relevanceScore: 0,
              summary: 'ファイルの内容を取得できませんでした'
            };
          }
        })
      );

      // 関連度スコア順に並び替え
      const sortedResults = analyzedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      return {
        query,
        totalCount: sortedResults.length,
        results: sortedResults
      };
    } catch (error) {
      console.error("内容分析付き検索エラー:", error);
      throw error;
    }
  }

  // 関連度スコアを計算する関数
  private calculateRelevanceScore(query: string, fileName: string, content: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const fileNameLower = fileName.toLowerCase();
    const contentLower = content.toLowerCase();
    
    let score = 0;
    
    queryTerms.forEach(term => {
      // ファイル名での一致（高い重み）
      if (fileNameLower.includes(term)) {
        score += 10;
      }
      
      // コンテンツでの一致回数をカウント
      const contentMatches = (contentLower.match(new RegExp(term, 'g')) || []).length;
      score += contentMatches * 2;
      
      // 完全一致の場合はボーナス
      if (fileNameLower === term || contentLower.includes(query.toLowerCase())) {
        score += 20;
      }
    });
    
    return score;
  }

  // ファイルの内容から要約を生成する関数
  private generateSummary(content: string, fileName: string): string {
    if (!content || content.trim().length === 0) {
      return `${fileName}の内容は空です。`;
    }

    // 内容を文に分割
    const sentences = content.split(/[。！？\.\!\?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) {
      return `${fileName}には読み取り可能なテキストが含まれていません。`;
    }

    // 短いファイルの場合はそのまま返す
    if (content.length <= 300) {
      return content.trim();
    }

    // 重要そうな文を抽出（長さと位置を考慮）
    const importantSentences = sentences
      .map((sentence, index) => ({
        text: sentence.trim(),
        score: this.calculateSentenceImportance(sentence, index, sentences.length),
        index
      }))
      .filter(s => s.text.length > 10) // 短すぎる文は除外
      .sort((a, b) => b.score - a.score)
      .slice(0, 3) // 上位3文を選択
      .sort((a, b) => a.index - b.index); // 元の順序に戻す

    if (importantSentences.length === 0) {
      // 重要な文が見つからない場合は最初の部分を返す
      return content.substring(0, 200) + '...';
    }

    const summary = importantSentences.map(s => s.text).join('。') + '。';
    
    // 要約が長すぎる場合は切り詰める
    if (summary.length > 400) {
      return summary.substring(0, 400) + '...';
    }

    return summary;
  }

  // 文の重要度を計算する関数
  private calculateSentenceImportance(sentence: string, index: number, totalSentences: number): number {
    let score = 0;
    
    // 文の長さによるスコア（適度な長さが重要）
    const length = sentence.length;
    if (length >= 20 && length <= 150) {
      score += 10;
    } else if (length >= 10 && length <= 200) {
      score += 5;
    }

    // 位置によるスコア（最初と最後の文は重要）
    if (index === 0 || index === totalSentences - 1) {
      score += 15;
    } else if (index < totalSentences * 0.3) {
      score += 10; // 前半の文
    }

    // 文の構造的特徴によるスコア
    // 1. 数字や日付を含む文（具体的な情報）
    if (/\d+/.test(sentence)) {
      score += 3;
    }

    // 2. 大文字で始まる単語が多い（固有名詞や重要な概念）
    const capitalWords = sentence.match(/[A-Z][a-z]+/g) || [];
    score += Math.min(capitalWords.length * 2, 8); // 最大8点

    // 3. 句読点の使用パターン（構造化された文）
    const punctuationCount = (sentence.match(/[、。：；]/g) || []).length;
    if (punctuationCount >= 2) {
      score += 3;
    }

    // 4. 疑問符や感嘆符（重要な問いかけや強調）
    if (/[？！\?\!]/.test(sentence)) {
      score += 5;
    }

    // 5. 括弧内の情報（補足説明や重要な詳細）
    if (/[（）\(\)]/.test(sentence)) {
      score += 2;
    }

    // 6. コロンや矢印（説明や関係性を示す）
    if (/[：→←↑↓]/.test(sentence)) {
      score += 3;
    }

    // 7. 文の複雑さ（複数の節を持つ文は重要な可能性）
    const clauseIndicators = sentence.match(/[がでにをはもとから]/g) || [];
    if (clauseIndicators.length >= 3) {
      score += 2;
    }

    // 8. 英数字の混在（技術的な内容や具体的な情報）
    if (/[a-zA-Z]/.test(sentence) && /\d/.test(sentence)) {
      score += 3;
    }

    return score;
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

  // 指定されたフォルダに新しいファイルを作成する関数
  async createFile(fileName: string, fileType: 'docs' | 'sheets' | 'presentations', folderId?: string): Promise<{
    id: string;
    name: string;
    webViewLink: string;
    type: string;
  }> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    
    try {
      // ファイルタイプに応じたMIMEタイプを設定
      let mimeType: string;
      let type: string;
      
      switch (fileType) {
        case 'docs':
          mimeType = 'application/vnd.google-apps.document';
          type = 'Google Document';
          break;
        case 'sheets':
          mimeType = 'application/vnd.google-apps.spreadsheet';
          type = 'Google Spreadsheet';
          break;
        case 'presentations':
          mimeType = 'application/vnd.google-apps.presentation';
          type = 'Google Slides';
          break;
        default:
          throw new Error(`サポートされていないファイルタイプです: ${fileType}`);
      }

      // ファイル作成のメタデータ
      const fileMetadata: any = {
        name: fileName,
        mimeType: mimeType,
      };

      // フォルダが指定されている場合は親フォルダを設定
      if (folderId) {
        fileMetadata.parents = [folderId];
      }

      // ファイルを作成
      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink'
      });

      if (!response.data.id || !response.data.name || !response.data.webViewLink) {
        throw new Error('ファイル作成に失敗しました: 必要な情報が取得できませんでした');
      }

      return {
        id: response.data.id,
        name: response.data.name,
        webViewLink: response.data.webViewLink,
        type: type
      };
    } catch (error) {
      console.error("ファイル作成エラー:", error);
      throw error;
    }
  }

  // フォルダ一覧を取得する関数
  async listFolders(): Promise<FileInfo[]> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    
    try {
      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        pageSize: 50,
        fields: "files(id, name, createdTime, modifiedTime, webViewLink)",
        orderBy: "name"
      });
      
      return response.data.files || [];
    } catch (error) {
      console.error("フォルダ一覧取得エラー:", error);
      throw error;
    }
  }

  // フォルダIDの存在確認
  async validateFolderId(folderId: string): Promise<boolean> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    
    try {
      const response = await drive.files.get({
        fileId: folderId,
        fields: "id, mimeType, trashed"
      });
      
      // フォルダかどうかとゴミ箱に入っていないかを確認
      return response.data.mimeType === 'application/vnd.google-apps.folder' && 
             !response.data.trashed;
    } catch (error) {
      console.error("フォルダID検証エラー:", error);
      return false;
    }
  }
} 