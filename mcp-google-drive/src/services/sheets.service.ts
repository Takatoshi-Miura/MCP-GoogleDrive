import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { SheetInfo } from "../types/index.js";

export class SheetsService {
  constructor(private auth: OAuth2Client) {}

  // Googleスプレッドシートのコメントを取得する関数
  async getSpreadsheetComments(spreadsheetId: string) {
    try {
      const drive = google.drive({ version: 'v3', auth: this.auth });

      // シンプルにDrive APIでコメントを取得
      console.log(`=== Debug: Fetching comments for ${spreadsheetId} ===`);
      
      const commentsResponse = await drive.comments.list({
        fileId: spreadsheetId,
        fields: 'comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent,replies,anchor)',
      });

      console.log('=== Raw API Response ===');
      console.log('Response status:', commentsResponse.status);
      console.log('Response data:', JSON.stringify(commentsResponse.data, null, 2));

      const allComments = commentsResponse.data.comments || [];
      console.log(`=== Found ${allComments.length} comments ===`);

      // 全コメントを単純にリストアップ
      const simpleComments = allComments.map((comment, index) => ({
        index: index + 1,
        commentId: comment.id || 'No ID',
        content: comment.content || 'No content',
        author: comment.author?.displayName || comment.author?.emailAddress || 'Unknown author',
        createdTime: comment.createdTime || 'No created time',
        modifiedTime: comment.modifiedTime || 'No modified time',
        resolved: comment.resolved || false,
        anchor: comment.anchor || 'No anchor',
        quotedFileContent: comment.quotedFileContent?.value || 'No quoted content',
        replies: comment.replies?.map(reply => ({
          author: reply.author?.displayName || reply.author?.emailAddress || 'Unknown',
          content: reply.content || 'No content',
          createdTime: reply.createdTime,
        })) || [],
        rawData: comment // 全データを含める
      }));

      return {
        status: 'success',
        spreadsheetId,
        totalComments: allComments.length,
        comments: [{
          sheetName: 'すべてのコメント（テスト）',
          sheetId: -1,
          comments: simpleComments,
        }],
        debug: {
          message: 'Simple test mode - showing all comments as-is',
          apiResponse: commentsResponse.data
        }
      };
    } catch (error) {
      console.error('=== Error in getSpreadsheetComments ===');
      console.error('Error details:', error);
      
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : 'Unknown error details',
        spreadsheetId
      };
    }
  }

  // スプレッドシートの値を取得する関数
  async getSheetValues(spreadsheetId: string, range: string): Promise<any[][]> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      
      return response.data.values || [];
    } catch (error) {
      console.error("スプレッドシートの値取得エラー:", error);
      throw error;
    }
  }

  // スプレッドシートの値を更新する関数
  async updateSheetValues(
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values,
        },
      });
    } catch (error) {
      console.error("スプレッドシートの値更新エラー:", error);
      throw error;
    }
  }

  // スプレッドシートに値を追加する関数
  async appendSheetValues(
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values,
        },
      });
    } catch (error) {
      console.error("スプレッドシートへの値追加エラー:", error);
      throw error;
    }
  }

  // スプレッドシートのシート一覧を取得する関数
  async getSpreadsheetSheets(spreadsheetId: string): Promise<SheetInfo[]> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties",
      });
      
      // シート名と基本情報を配列として返す
      const sheetList = response.data.sheets?.map((sheet: any) => ({
        title: sheet.properties?.title || "",
        sheetId: sheet.properties?.sheetId || 0,
        index: sheet.properties?.index || 0,
        sheetType: sheet.properties?.sheetType || "GRID",
        rowCount: sheet.properties?.gridProperties?.rowCount || 0,
        columnCount: sheet.properties?.gridProperties?.columnCount || 0,
      })) || [];
      
      return sheetList;
    } catch (error) {
      console.error("スプレッドシートのシート一覧取得エラー:", error);
      throw error;
    }
  }

  // スプレッドシートの全シートの内容を取得する関数
  async getAllSheetsData(spreadsheetId: string): Promise<Record<string, any[][]>> {
    try {
      // まずシート一覧を取得
      const sheets = await this.getSpreadsheetSheets(spreadsheetId);
      
      // 各シートの内容を取得
      const result: Record<string, any[][]> = {};
      
      // 各シートに対して処理を実行
      for (const sheet of sheets) {
        try {
          const sheetTitle = sheet.title;
          const range = `${sheetTitle}!A:Z`; // A列からZ列までを対象にする
          
          const values = await this.getSheetValues(spreadsheetId, range);
          result[sheetTitle] = values;
        } catch (error) {
          console.error(`シート "${sheet.title}" のデータ取得エラー:`, error);
          // エラーが発生したシートは空配列を設定
          result[sheet.title] = [];
        }
      }
      
      return result;
    } catch (error) {
      console.error("スプレッドシートの全シート取得エラー:", error);
      throw error;
    }
  }

  // スプレッドシートのテキストのみを抽出する関数
  async getSpreadsheetText(spreadsheetId: string): Promise<string> {
    try {
      // スプレッドシートの全シートデータを取得
      const allSheetsData = await this.getAllSheetsData(spreadsheetId);
      
      // スプレッドシートのメタデータを取得してタイトルを表示
      const sheets = google.sheets({ version: "v4", auth: this.auth });
      const spreadsheetMetadata = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "properties.title"
      });
      
      // テキスト抽出結果
      let extractedText = "";
      
      // タイトルを追加
      if (spreadsheetMetadata.data.properties?.title) {
        extractedText += `タイトル: ${spreadsheetMetadata.data.properties.title}\n\n`;
      }
      
      // データが存在しない場合
      if (!allSheetsData || Object.keys(allSheetsData).length === 0) {
        return extractedText + "スプレッドシートにデータが存在しません。";
      }
      
      // 各シートのデータをテキスト形式で追加
      for (const [sheetName, values] of Object.entries(allSheetsData)) {
        if (!values || values.length === 0) {
          continue; // データがないシートはスキップ
        }
        
        // シート名を追加
        extractedText += `===== シート: ${sheetName} =====\n\n`;
        
        // 各行のデータをテキスト形式で変換
        for (const row of values) {
          if (!row || row.length === 0) {
            continue; // 空の行はスキップ
          }
          
          // 行の各セルをパイプ区切りでテキスト変換
          const rowText = row.map((cell: any) => {
            // nullやundefinedの場合は空文字に変換
            if (cell === null || cell === undefined) {
              return "";
            }
            // 数値や真偽値などを文字列に変換
            return String(cell);
          }).join(" | ");
          
          // 行テキストを追加
          if (rowText.trim()) {
            extractedText += rowText + "\n";
          }
        }
        
        // シートの区切りとして空行を追加
        extractedText += "\n\n";
      }
      
      // 余分な改行を整理
      extractedText = extractedText.replace(/\n\n\n+/g, "\n\n");
      
      return extractedText;
    } catch (error) {
      console.error("スプレッドシートテキスト抽出エラー:", error);
      throw error;
    }
  }
} 