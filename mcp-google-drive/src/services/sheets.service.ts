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

  // シート内のデータのある範囲を取得する関数
  async getSheetDataRange(spreadsheetId: string, sheetTitle: string): Promise<string> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      // まず、シートの基本情報を取得してGridPropertiesを確認
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(title,sheetId,gridProperties))"
      });
      
      const targetSheet = spreadsheetInfo.data.sheets?.find(
        sheet => sheet.properties?.title === sheetTitle
      );
      
      if (!targetSheet || !targetSheet.properties) {
        throw new Error(`シート "${sheetTitle}" が見つかりません`);
      }
      
      // データ範囲を検出するため、大きめの範囲で一度取得
      const maxColumns = targetSheet.properties.gridProperties?.columnCount || 1000;
      const testMaxColumnLetter = this.getColumnLetter(maxColumns - 1);
      const testRange = `${sheetTitle}!A1:${testMaxColumnLetter}1000`;
      
      // 値を取得してデータのある範囲を特定
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: testRange,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });
      
      const values = response.data.values || [];
      
      if (values.length === 0) {
        return `${sheetTitle}!A1:A1`; // データがない場合は最小範囲
      }
      
      // 実際にデータがある最大行と最大列を特定
      let maxRow = 0;
      let maxCol = 0;
      
      for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
        const row = values[rowIndex];
        if (row && row.length > 0) {
          // この行にデータがある
          maxRow = Math.max(maxRow, rowIndex + 1);
          
          // この行で最後のデータがある列を特定
          for (let colIndex = row.length - 1; colIndex >= 0; colIndex--) {
            if (row[colIndex] !== null && row[colIndex] !== undefined && String(row[colIndex]).trim() !== '') {
              maxCol = Math.max(maxCol, colIndex + 1);
              break;
            }
          }
        }
      }
      
      if (maxRow === 0 || maxCol === 0) {
        return `${sheetTitle}!A1:A1`; // データがない場合
      }
      
      const dataMaxColumnLetter = this.getColumnLetter(maxCol - 1);
      return `${sheetTitle}!A1:${dataMaxColumnLetter}${maxRow}`;
      
    } catch (error) {
      console.error(`シート "${sheetTitle}" のデータ範囲取得エラー:`, error);
      // エラーの場合はデフォルトの範囲を返す
      return `${sheetTitle}!A1:Z1000`;
    }
  }

  // 特定のシートの名前からデータ範囲と値を取得する関数
  async getSheetByName(spreadsheetId: string, sheetName: string): Promise<{
    sheetName: string;
    range: string;
    values: any[][];
  }> {
    try {
      const dataRange = await this.getSheetDataRange(spreadsheetId, sheetName);
      const values = await this.getSheetValues(spreadsheetId, dataRange);
      
      return {
        sheetName,
        range: dataRange,
        values
      };
    } catch (error) {
      console.error(`シート "${sheetName}" の取得エラー:`, error);
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

  // スプレッドシートの指定位置に値を挿入する関数
  async insertSheetValuesAtPosition(
    spreadsheetId: string,
    range: string,
    values: any[][],
    insertPosition: number
  ): Promise<void> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      // 範囲からシート名を抽出
      const sheetName = range.split('!')[0];
      
      // まずシート情報を取得してsheetIdを得る
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties"
      });
      
      const sheet = spreadsheetInfo.data.sheets?.find(s => s.properties?.title === sheetName);
      if (!sheet || !sheet.properties) {
        throw new Error(`シート "${sheetName}" が見つかりません`);
      }
      
      const sheetId = sheet.properties.sheetId;
      const rowsToInsert = values.length;
      
      // batchUpdateで行を挿入してから値を設定
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // 1. 指定位置に行を挿入
            {
              insertDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: "ROWS",
                  startIndex: insertPosition - 1, // 0ベースに変換
                  endIndex: insertPosition - 1 + rowsToInsert
                },
                inheritFromBefore: false
              }
            },
            // 2. 挿入した行に値を設定
            {
              updateCells: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: insertPosition - 1,
                  endRowIndex: insertPosition - 1 + rowsToInsert,
                  startColumnIndex: this.getColumnIndex(range),
                  endColumnIndex: this.getColumnIndex(range) + (values[0]?.length || 0)
                },
                rows: values.map(row => ({
                  values: row.map(cell => ({
                    userEnteredValue: {
                      stringValue: String(cell)
                    }
                  }))
                })),
                fields: "userEnteredValue"
              }
            }
          ]
        }
      });
    } catch (error) {
      console.error("スプレッドシートへの値挿入エラー:", error);
      throw error;
    }
  }

  // 範囲文字列から列のインデックスを取得するヘルパー関数
  private getColumnIndex(range: string): number {
    const cellPart = range.split('!')[1] || range;
    const match = cellPart.match(/^([A-Z]+)/);
    if (!match) return 0;
    
    const columnLetters = match[1];
    let index = 0;
    for (let i = 0; i < columnLetters.length; i++) {
      index = index * 26 + (columnLetters.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1; // 0ベースに変換
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
          // データのある範囲を自動取得
          const range = await this.getSheetDataRange(spreadsheetId, sheetTitle);
          
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

  // スプレッドシートに新しいシートを作成する関数
  async createNewSheet(spreadsheetId: string, title: string): Promise<any> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: title,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 26
                  }
                }
              }
            }
          ]
        }
      });
      
      const newSheet = response.data.replies?.[0]?.addSheet;
      return {
        status: 'success',
        message: `新しいシート "${title}" を作成しました`,
        spreadsheetId: spreadsheetId,
        sheetTitle: title,
        sheetId: newSheet?.properties?.sheetId,
        response: response.data
      };
    } catch (error) {
      console.error("スプレッドシートシート作成エラー:", error);
      throw error;
    }
  }

  // スプレッドシートにグラフを作成する関数
  async createChartInSheet(
    spreadsheetId: string,
    sheetId: number,
    chartType: 'COLUMN' | 'LINE' | 'PIE' | 'BAR' | 'SCATTER',
    dataRange: string,
    title?: string,
    position?: { row: number; column: number },
    axisOptions?: {
      xAxisTitle?: string;
      yAxisTitle?: string;
    }
  ): Promise<any> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      // dataRangeを解析してソース範囲を決定
      const { startRow, endRow, startCol, endCol } = this.parseDataRange(dataRange);
      
      // データの内容に基づいて適切な軸タイトルを推定
      const defaultAxisTitles = await this.inferAxisTitles(spreadsheetId, sheetId, startRow, startCol, endCol);
      
      // 軸タイトルを決定（パラメータ指定 > 推定値 > デフォルト値の優先順位）
      const xAxisTitle = axisOptions?.xAxisTitle || defaultAxisTitles.xAxis || "カテゴリ";
      const yAxisTitle = axisOptions?.yAxisTitle || defaultAxisTitles.yAxis || "値";
      
      let chartSpec: any;
      
      // 円グラフの場合は専用のpieChartオブジェクトを使用
      if (chartType === 'PIE') {
        chartSpec = {
          title: title || "円グラフ",
          pieChart: {
            legendPosition: "RIGHT_LEGEND",
            domain: {
              sourceRange: {
                sources: [
                  {
                    sheetId: sheetId,
                    startRowIndex: startRow,
                    endRowIndex: endRow,
                    startColumnIndex: startCol,
                    endColumnIndex: startCol + 1
                  }
                ]
              }
            },
            series: {
              sourceRange: {
                sources: [
                  {
                    sheetId: sheetId,
                    startRowIndex: startRow,
                    endRowIndex: endRow,
                    startColumnIndex: endCol,
                    endColumnIndex: endCol + 1
                  }
                ]
              }
            },
            threeDimensional: false
          },
          // 凡例のテキストフォーマットを追加
          titleTextFormat: {
            fontFamily: "Arial",
            fontSize: 14,
            bold: true
          }
        };
      } else {
        // B列以降の全ての列を系列として作成
        const series = [];
        for (let col = startCol + 1; col <= endCol; col++) {
          series.push({
            series: {
              sourceRange: {
                sources: [
                  {
                    sheetId: sheetId,
                    startRowIndex: startRow,
                    endRowIndex: endRow,
                    startColumnIndex: col,
                    endColumnIndex: col + 1
                  }
                ]
              }
            },
            targetAxis: "LEFT_AXIS"
          });
        }

        // その他のチャートタイプはbasicChartを使用
        chartSpec = {
          title: title || `${chartType}グラフ`,
          basicChart: {
            chartType: chartType,
            legendPosition: "BOTTOM_LEGEND",
            axis: [
              {
                position: "BOTTOM_AXIS",
                title: xAxisTitle,
                format: {
                  fontFamily: "Roboto"
                },
                viewWindowOptions: {}
              },
              {
                position: "LEFT_AXIS", 
                title: yAxisTitle,
                format: {
                  fontFamily: "Roboto"
                },
                viewWindowOptions: {}
              }
            ],
            domains: [
              {
                domain: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId: sheetId,
                        startRowIndex: startRow,
                        endRowIndex: endRow,
                        startColumnIndex: startCol,
                        endColumnIndex: startCol + 1
                      }
                    ]
                  }
                }
              }
            ],
            series: series
          },
          hiddenDimensionStrategy: "SKIP_HIDDEN_ROWS_AND_COLUMNS",
          titleTextFormat: {
            fontFamily: "Roboto"
          },
          fontName: "Roboto"
        };
      }

      console.log(`チャートスペック (${chartType}):`, JSON.stringify(chartSpec, null, 2));

      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addChart: {
                chart: {
                  spec: chartSpec,
                  position: {
                    overlayPosition: {
                      anchorCell: {
                        sheetId: sheetId,
                        rowIndex: position?.row || 0,
                        columnIndex: position?.column || 3
                      },
                      offsetXPixels: 0,
                      offsetYPixels: 0,
                      widthPixels: 600,
                      heightPixels: 371
                    }
                  }
                }
              }
            }
          ]
        }
      });

      return {
        status: 'success',
        spreadsheetId,
        sheetId,
        chartType,
        dataRange,
        title,
        position,
        axisOptions: chartType === 'PIE' ? undefined : { xAxisTitle, yAxisTitle },
        response: response.data
      };
    } catch (error) {
      console.error("スプレッドシートへのグラフ作成エラー:", error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'グラフ作成に失敗しました',
        spreadsheetId,
        sheetId,
        chartType,
        dataRange
      };
    }
  }

  // データの内容に基づいて適切な軸タイトルを推定する関数
  private async inferAxisTitles(
    spreadsheetId: string, 
    sheetId: number, 
    startRow: number, 
    startCol: number, 
    endCol: number
  ): Promise<{ xAxis: string; yAxis: string }> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    
    try {
      // ヘッダー行（最初の行）のデータを取得
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${this.getColumnLetter(startCol)}${startRow + 1}:${this.getColumnLetter(endCol)}${startRow + 1}`
      });
      
      const headerValues = response.data.values?.[0] || [];
      
      // X軸（最初の列）とY軸（最後の列）のヘッダーを取得
      const xAxisHeader = headerValues[0] || "";
      const yAxisHeader = headerValues[headerValues.length - 1] || "";
      
      // ヘッダーの内容に基づいて適切なタイトルを推定
      const xAxisTitle = this.normalizeAxisTitle(xAxisHeader);
      const yAxisTitle = this.normalizeAxisTitle(yAxisHeader);
      
      console.log(`推定された軸タイトル - X軸: "${xAxisTitle}", Y軸: "${yAxisTitle}"`);
      
      return {
        xAxis: xAxisTitle,
        yAxis: yAxisTitle
      };
    } catch (error) {
      console.error("軸タイトル推定エラー:", error);
      // エラーの場合はデフォルト値を返す
      return {
        xAxis: "カテゴリ",
        yAxis: "値"
      };
    }
  }

  // 軸タイトルを正規化する関数
  private normalizeAxisTitle(headerText: string): string {
    if (!headerText || typeof headerText !== 'string') {
      return "";
    }
    
    const text = headerText.trim();
    
    // 日付関連のパターン
    if (/日付|date|時間|time|年月|月|年/i.test(text)) {
      return "日付";
    }
    
    // 金額関連のパターン
    if (/金額|価格|円|¥|amount|price|cost|費用|収入|支出|資産|残高/i.test(text)) {
      return "金額（円）";
    }
    
    // 数量関連のパターン
    if (/数量|個数|件数|count|quantity|number|ポイント|スコア|点数/i.test(text)) {
      return "数量";
    }
    
    // パーセンテージ関連のパターン
    if (/率|％|%|percent|ratio|割合/i.test(text)) {
      return "割合（%）";
    }
    
    // そのまま使用（ただし長すぎる場合は短縮）
    if (text.length > 15) {
      return text.substring(0, 12) + "...";
    }
    
    return text;
  }

  // 列番号を列文字に変換するヘルパー関数
  private getColumnLetter(columnIndex: number): string {
    let result = '';
    while (columnIndex >= 0) {
      result = String.fromCharCode(65 + (columnIndex % 26)) + result;
      columnIndex = Math.floor(columnIndex / 26) - 1;
    }
    return result;
  }

  // データ範囲文字列を解析するヘルパー関数
  private parseDataRange(dataRange: string): { startRow: number; endRow: number; startCol: number; endCol: number } {
    try {
      // A1:B166 形式の範囲を解析
      const match = dataRange.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (!match) {
        throw new Error(`無効なデータ範囲形式: ${dataRange}`);
      }

      const [, startColStr, startRowStr, endColStr, endRowStr] = match;
      
      // 既存のgetColumnIndexメソッドを活用して列文字を数値に変換
      const startCol = this.getColumnIndex(startColStr);
      const endCol = this.getColumnIndex(endColStr);
      
      // 行番号を0ベースに変換
      const startRow = parseInt(startRowStr) - 1;
      const endRow = parseInt(endRowStr);
      
      return { startRow, endRow, startCol, endCol };
    } catch (error) {
      console.error(`データ範囲解析エラー: ${dataRange}`, error);
      // デフォルト値を返す
      return { startRow: 0, endRow: 10, startCol: 0, endCol: 1 };
    }
  }

  // スプレッドシートのシートをコピーする関数
  async copySheet(
    spreadsheetId: string,
    sourceSheetId: number,
    newSheetName?: string
  ): Promise<any> {
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    try {
      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              duplicateSheet: {
                sourceSheetId: sourceSheetId,
                newSheetName: newSheetName || `コピー - ${sourceSheetId}`,
                insertSheetIndex: 0
              }
            }
          ]
        }
      });

      const duplicatedSheet = response.data.replies?.[0]?.duplicateSheet;
      return {
        status: 'success',
        message: `シート "${newSheetName || `コピー - ${sourceSheetId}`}" をコピーしました`,
        spreadsheetId: spreadsheetId,
        sourceSheetId: sourceSheetId,
        newSheetId: duplicatedSheet?.properties?.sheetId,
        newSheetName: duplicatedSheet?.properties?.title,
        response: response.data
      };
    } catch (error) {
      console.error("スプレッドシートシートコピーエラー:", error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'シートのコピーに失敗しました',
        spreadsheetId,
        sourceSheetId
      };
    }
  }
} 