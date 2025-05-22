import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { authorize } from "./auth.js";
import * as pdfParse from "pdf-parse";
const pdf = pdfParse.default || pdfParse;

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 認証情報ファイルのパスを設定
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH || path.join(__dirname, "../credentials/client_secret.json");
const TOKEN_PATH = process.env.TOKEN_PATH || path.join(__dirname, "../credentials/token.json");

// Google APIのスコープ設定
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/presentations"
];

// MCPサーバーの作成
const server = new McpServer({
  name: "mcp-google-drive",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// JSONを安全にパースする関数
function safeJsonParse(str: string): any {
  if (!str) return null;
  
  try {
    // すでにオブジェクトの場合はそのまま返す
    if (typeof str === "object") return str;
    
    // 文字列の場合はパースする
    return JSON.parse(str);
  } catch (error) {
    console.error("JSONパースエラー:", error);
    return null;
  }
}

// Google認証用クライアントの取得
async function getAuthClient(): Promise<OAuth2Client | null> {
  return authorize();
}

// Googleドライブのファイル一覧を取得する関数
async function listFiles(auth: OAuth2Client, query?: string): Promise<any[]> {
  const drive = google.drive({ version: "v3", auth });
  
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

// スプレッドシートの値を取得する関数
async function getSheetValues(auth: OAuth2Client, spreadsheetId: string, range: string): Promise<any[][]> {
  const sheets = google.sheets({ version: "v4", auth });
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
async function updateSheetValues(
  auth: OAuth2Client,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth });
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
async function appendSheetValues(
  auth: OAuth2Client,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth });
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

// Googleドキュメントの内容を取得する関数
async function getDocContent(auth: OAuth2Client, documentId: string): Promise<any> {
  const docs = google.docs({ version: "v1", auth });
  try {
    const response = await docs.documents.get({
      documentId,
    });
    
    return response.data;
  } catch (error) {
    console.error("Googleドキュメントの内容取得エラー:", error);
    throw error;
  }
}

// Googleドキュメントにテキストを挿入する関数
async function insertTextToDoc(
  auth: OAuth2Client,
  documentId: string,
  location: number,
  text: string
): Promise<any> {
  const docs = google.docs({ version: "v1", auth });
  try {
    const response = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: {
                index: location,
              },
              text,
            },
          },
        ],
      },
    });
    
    return response.data;
  } catch (error) {
    console.error("Googleドキュメントへのテキスト挿入エラー:", error);
    throw error;
  }
}

// Googleドキュメントのテキストを置換する関数
async function replaceTextInDoc(
  auth: OAuth2Client,
  documentId: string,
  text: string,
  replaceText: string,
  matchCase: boolean = false
): Promise<any> {
  const docs = google.docs({ version: "v1", auth });
  try {
    const response = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: {
                text,
                matchCase,
              },
              replaceText,
            },
          },
        ],
      },
    });
    
    return response.data;
  } catch (error) {
    console.error("Googleドキュメントのテキスト置換エラー:", error);
    throw error;
  }
}

// Googleドキュメントに画像を挿入する関数
async function insertImage(
  auth: OAuth2Client,
  documentId: string,
  location: number,
  imageUri: string,
  width?: number,
  height?: number
): Promise<any> {
  const docs = google.docs({ version: "v1", auth });
  try {
    const request: any = {
      documentId,
      requestBody: {
        requests: [
          {
            insertInlineImage: {
              location: {
                index: location,
              },
              uri: imageUri,
            },
          },
        ],
      },
    };
    
    // サイズ指定がある場合、設定を追加
    if (width && height) {
      request.requestBody.requests[0].insertInlineImage.objectSize = {
        width: {
          magnitude: width,
          unit: "PT",
        },
        height: {
          magnitude: height,
          unit: "PT",
        },
      };
    }
    
    const response = await docs.documents.batchUpdate(request);
    
    return response.data;
  } catch (error) {
    console.error("Googleドキュメントへの画像挿入エラー:", error);
    throw error;
  }
}

// Googleスライドのコンテンツを取得する関数
async function getPresentationContent(auth: OAuth2Client, presentationId: string): Promise<any> {
  const slides = google.slides({ version: "v1", auth });
  try {
    const response = await slides.presentations.get({
      presentationId,
    });
    
    return response.data;
  } catch (error) {
    console.error("Googleスライドの内容取得エラー:", error);
    throw error;
  }
}

// Googleスライドの特定ページを画像として取得する関数
async function getSlideImageThumbnail(auth: OAuth2Client, presentationId: string, pageObjectId?: string): Promise<any> {
  try {
    // まずプレゼンテーションの内容を取得してページIDを確認
    const presentation = await getPresentationContent(auth, presentationId);
    
    // ページIDが指定されていない場合は最初のページを使用
    let targetPageId = pageObjectId;
    if (!targetPageId && presentation.slides && presentation.slides.length > 0) {
      targetPageId = presentation.slides[0].objectId;
    }
    
    if (!targetPageId) {
      throw new Error("スライドページが見つかりません");
    }
    
    // Driveのサムネイル取得APIを使用して画像を取得
    const drive = google.drive({ version: "v3", auth });
    const response = await drive.files.get({
      fileId: presentationId,
      fields: "thumbnailLink",
    });
    
    return {
      thumbnailLink: response.data.thumbnailLink,
      presentationId,
      pageObjectId: targetPageId
    };
  } catch (error) {
    console.error("スライド画像取得エラー:", error);
    throw error;
  }
}

// Googleスライドの特定ページを取得する関数
async function getSlideByPageNumber(auth: OAuth2Client, presentationId: string, pageNumber: number): Promise<any> {
  try {
    // プレゼンテーション全体を取得
    const presentation = await getPresentationContent(auth, presentationId);
    
    // 存在するスライド数を確認
    if (!presentation.slides || presentation.slides.length === 0) {
      throw new Error("スライドが存在しません");
    }
    
    // ページ番号を検証（1から始まる番号を0から始まるインデックスに変換）
    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= presentation.slides.length) {
      throw new Error(`指定されたページ番号（${pageNumber}）は範囲外です。スライド数: ${presentation.slides.length}`);
    }
    
    // 特定のページを返す
    return {
      presentation: {
        presentationId,
        title: presentation.title,
        totalSlides: presentation.slides.length
      },
      slide: presentation.slides[pageIndex]
    };
  } catch (error) {
    console.error("スライドページ取得エラー:", error);
    throw error;
  }
}

// Googleスライドのコメントを取得する関数
async function getPresentationComments(auth: OAuth2Client, presentationId: string): Promise<any> {
  const drive = google.drive({ version: "v3", auth });
  try {
    // スライドのコメントを取得するにはDrive APIを使用
    const response = await drive.comments.list({
      fileId: presentationId,
      fields: "comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent)",
      includeDeleted: false
    });
    
    return response.data.comments || [];
  } catch (error) {
    console.error("スライドコメント取得エラー:", error);
    throw error;
  }
}

// スプレッドシートのシート一覧を取得する関数
async function getSpreadsheetSheets(auth: OAuth2Client, spreadsheetId: string): Promise<any[]> {
  const sheets = google.sheets({ version: "v4", auth });
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
async function getAllSheetsData(auth: OAuth2Client, spreadsheetId: string): Promise<Record<string, any[][]>> {
  try {
    // まずシート一覧を取得
    const sheets = await getSpreadsheetSheets(auth, spreadsheetId);
    
    // 各シートの内容を取得
    const result: Record<string, any[][]> = {};
    
    // 各シートに対して処理を実行
    for (const sheet of sheets) {
      try {
        const sheetTitle = sheet.title;
        const range = `${sheetTitle}!A:Z`; // A列からZ列までを対象にする
        
        const values = await getSheetValues(auth, spreadsheetId, range);
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

// GoogleドライブのPDFからテキストを抽出する関数
async function getPdfText(auth: OAuth2Client, fileId: string): Promise<string> {
  try {
    const drive = google.drive({ version: "v3", auth });
    
    // PDFファイルの取得
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media',
    }, { responseType: 'arraybuffer' });
    
    if (!response.data) {
      throw new Error("PDFデータの取得に失敗しました");
    }
    
    // PDFファイルをバッファとして取得
    const pdfBuffer = Buffer.from(response.data as ArrayBuffer);
    
    // PDFからテキストを抽出（エラーハンドリングを強化）
    let data: any;
    try {
      // pdf-parseをより安全に呼び出す
      data = await new Promise((resolve, reject) => {
        try {
          const result = pdf(pdfBuffer);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    } catch (error) {
      console.error("PDFパース中にエラーが発生しました:", error);
      throw new Error("PDFからテキストを抽出できませんでした");
    }
    
    // ファイルの情報を取得
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: "name,createdTime,modifiedTime,owners"
    });
    
    // 結果のテキストを整形
    let extractedText = "";
    
    // ファイル情報を追加
    if (fileInfo.data.name) {
      extractedText += `ファイル名: ${fileInfo.data.name}\n`;
    }
    if (fileInfo.data.createdTime) {
      extractedText += `作成日時: ${fileInfo.data.createdTime}\n`;
    }
    if (fileInfo.data.modifiedTime) {
      extractedText += `更新日時: ${fileInfo.data.modifiedTime}\n`;
    }
    if (fileInfo.data.owners && fileInfo.data.owners.length > 0) {
      extractedText += `所有者: ${fileInfo.data.owners[0].displayName || fileInfo.data.owners[0].emailAddress}\n`;
    }
    
    extractedText += `\n--- PDFコンテンツ ---\n\n`;
    // data.textが存在することを確認
    extractedText += data.text || "PDFからテキストを抽出できませんでした";
    
    // 余分な改行を整理
    extractedText = extractedText.replace(/\n\n\n+/g, "\n\n");
    
    return extractedText;
  } catch (error) {
    console.error("PDF抽出エラー:", error);
    throw error;
  }
}

// Googleドライブ内のファイル一覧を取得するツール
server.tool(
  "g_drive_list_files",
  "Googleドライブのファイル一覧を取得する",
  {
    query: z.string().optional().describe("検索クエリ（例: 'mimeType=\"application/vnd.google-apps.spreadsheet\"'）"),
  },
  async ({ query }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const files = await listFiles(auth, query);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              files
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Googleドライブのファイル一覧取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドライブ内のスプレッドシート一覧を取得するツール
server.tool(
  "g_drive_list_sheets",
  "Googleドライブ内のスプレッドシートの一覧を取得する",
  {
    random_string: z.string().optional().describe("Dummy parameter for no-parameter tools"),
  },
  async ({}) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const query = "mimeType='application/vnd.google-apps.spreadsheet'";
      const files = await listFiles(auth, query);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              spreadsheets: files
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スプレッドシート一覧の取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドライブ内のドキュメント一覧を取得するツール
server.tool(
  "g_drive_list_docs",
  "Googleドライブ内のドキュメントの一覧を取得する",
  {
    random_string: z.string().optional().describe("Dummy parameter for no-parameter tools"),
  },
  async ({}) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const query = "mimeType='application/vnd.google-apps.document'";
      const files = await listFiles(auth, query);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              documents: files
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `ドキュメント一覧の取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// スプレッドシートから値を取得するツール
server.tool(
  "g_drive_get_sheet_values",
  "Googleスプレッドシートから値を取得する",
  {
    spreadsheetId: z.string().describe("スプレッドシートのID"),
    range: z.string().describe("取得する範囲（例: Sheet1!A1:B10）"),
  },
  async ({ spreadsheetId, range }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const values = await getSheetValues(auth, spreadsheetId, range);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              values
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スプレッドシートの値取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// スプレッドシートの値を更新するツール
server.tool(
  "g_drive_update_sheet_values",
  "Googleスプレッドシートの値を更新する",
  {
    spreadsheetId: z.string().describe("スプレッドシートのID"),
    range: z.string().describe("更新する範囲（例: Sheet1!A1:B2）"),
    values: z.array(z.array(z.any())).describe("更新する値の2次元配列"),
  },
  async ({ spreadsheetId, range, values }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      await updateSheetValues(auth, spreadsheetId, range, values);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              message: "スプレッドシートの値を更新しました"
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スプレッドシートの値更新に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// スプレッドシートに値を追加するツール
server.tool(
  "g_drive_append_sheet_values",
  "Googleスプレッドシートに値を追加する",
  {
    spreadsheetId: z.string().describe("スプレッドシートのID"),
    range: z.string().describe("追加する範囲（例: Sheet1!A1）"),
    values: z.array(z.array(z.any())).describe("追加する値の2次元配列"),
  },
  async ({ spreadsheetId, range, values }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      await appendSheetValues(auth, spreadsheetId, range, values);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              message: "スプレッドシートに値を追加しました"
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スプレッドシートの値追加に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドキュメントの内容を取得するツール
server.tool(
  "g_drive_get_doc_content",
  "Google Docsドキュメントの内容を取得する",
  {
    documentId: z.string().describe("ドキュメントのID"),
  },
  async ({ documentId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const document = await getDocContent(auth, documentId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              document
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `ドキュメントの内容取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// スプレッドシートのシート一覧を取得するツール
server.tool(
  "g_drive_get_spreadsheet_sheets",
  "Googleスプレッドシートのシート一覧を取得する",
  {
    spreadsheetId: z.string().describe("スプレッドシートのID"),
  },
  async ({ spreadsheetId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const sheets = await getSpreadsheetSheets(auth, spreadsheetId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              sheets
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スプレッドシートのシート一覧取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// スプレッドシートの全シートデータを取得するツール
server.tool(
  "g_drive_get_all_sheets_data",
  "Googleスプレッドシートの全シートデータを取得する",
  {
    spreadsheetId: z.string().describe("スプレッドシートのID"),
  },
  async ({ spreadsheetId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const allSheetsData = await getAllSheetsData(auth, spreadsheetId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              sheets: allSheetsData
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スプレッドシートの全シートデータ取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドキュメントにテキストを挿入するツール
server.tool(
  "g_drive_insert_text_to_doc",
  "Googleドキュメントに指定位置にテキストを挿入する",
  {
    documentId: z.string().describe("ドキュメントのID"),
    location: z.number().describe("テキストを挿入する位置（インデックス）"),
    text: z.string().describe("挿入するテキスト"),
  },
  async ({ documentId, location, text }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const result = await insertTextToDoc(auth, documentId, location, text);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              message: "ドキュメントにテキストを挿入しました",
              result
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `ドキュメントへのテキスト挿入に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドキュメントのテキストを置換するツール
server.tool(
  "g_drive_replace_text_in_doc",
  "Googleドキュメント内のテキストを置換する",
  {
    documentId: z.string().describe("ドキュメントのID"),
    text: z.string().describe("置換対象のテキスト"),
    replaceText: z.string().describe("置換後のテキスト"),
    matchCase: z.boolean().optional().describe("大文字小文字を区別するかどうか（デフォルト: false）"),
  },
  async ({ documentId, text, replaceText, matchCase = false }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const result = await replaceTextInDoc(auth, documentId, text, replaceText, matchCase);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              message: "ドキュメント内のテキストを置換しました",
              result
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `ドキュメント内のテキスト置換に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドキュメントに画像を挿入するツール
server.tool(
  "g_drive_insert_image",
  "Googleドキュメントに画像を挿入する",
  {
    documentId: z.string().describe("ドキュメントのID"),
    location: z.number().describe("画像を挿入する位置（インデックス）"),
    imageUri: z.string().describe("画像のURI（URL、data URI、またはGoogleドライブのURI）"),
    width: z.number().optional().describe("画像の幅（pt）"),
    height: z.number().optional().describe("画像の高さ（pt）"),
  },
  async ({ 
    documentId, 
    location, 
    imageUri,
    width,
    height
  }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const result = await insertImage(auth, documentId, location, imageUri, width, height);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              message: "ドキュメントに画像を挿入しました",
              result
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `ドキュメントへの画像挿入に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドライブ内のスライド一覧を取得するツール
server.tool(
  "g_drive_list_presentations",
  "Googleドライブ内のスライドの一覧を取得する",
  {
    random_string: z.string().optional().describe("Dummy parameter for no-parameter tools"),
  },
  async ({}) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const query = "mimeType='application/vnd.google-apps.presentation'";
      const files = await listFiles(auth, query);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              presentations: files
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スライド一覧の取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleスライドの内容を取得するツール
server.tool(
  "g_drive_get_presentation_content",
  "Googleスライドの内容を取得する",
  {
    presentationId: z.string().describe("スライドのID"),
  },
  async ({ presentationId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const presentationContent = await getPresentationContent(auth, presentationId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              presentation: presentationContent
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スライドの内容取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleスライドの特定ページを画像として取得するツール
server.tool(
  "g_drive_get_slide_thumbnail",
  "Googleスライドの特定ページのサムネイル画像を取得する",
  {
    presentationId: z.string().describe("スライドのID"),
    pageObjectId: z.string().optional().describe("取得するスライドページのID（指定しない場合は最初のページ）"),
  },
  async ({ presentationId, pageObjectId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const thumbnailInfo = await getSlideImageThumbnail(auth, presentationId, pageObjectId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              thumbnail: thumbnailInfo
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スライドのサムネイル取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleスライドの特定ページを番号指定で取得するツール
server.tool(
  "g_drive_get_slide_by_page_number",
  "Googleスライドの特定ページを番号指定で取得する",
  {
    presentationId: z.string().describe("スライドのID"),
    pageNumber: z.number().describe("取得するスライドのページ番号（1から始まる）"),
  },
  async ({ presentationId, pageNumber }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const slideData = await getSlideByPageNumber(auth, presentationId, pageNumber);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              data: slideData
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スライドの取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleスライドのコメントを取得するツール
server.tool(
  "g_drive_get_presentation_comments",
  "Googleスライドのコメントを取得する",
  {
    presentationId: z.string().describe("スライドのID"),
  },
  async ({ presentationId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const comments = await getPresentationComments(auth, presentationId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              comments
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スライドのコメント取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleスライドのテキストのみを抽出する関数
async function getPresentationText(auth: OAuth2Client, presentationId: string): Promise<string> {
  try {
    // プレゼンテーション全体を取得
    const presentation = await getPresentationContent(auth, presentationId);
    
    // テキスト抽出結果
    let extractedText = "";
    
    // タイトルを追加
    if (presentation.title) {
      extractedText += `タイトル: ${presentation.title}\n\n`;
    }
    
    // スライドが存在しない場合
    if (!presentation.slides || presentation.slides.length === 0) {
      return extractedText + "スライドが存在しません。";
    }
    
    // 各スライドのテキストを抽出
    presentation.slides.forEach((slide: any, index: number) => {
      // スライド番号を追加
      extractedText += `===== スライド ${index + 1} =====\n`;
      
      // スライドタイトルがあれば追加（通常、最初のテキストボックスがタイトル）
      let slideTitle = "";
      if (slide.pageElements && slide.pageElements.length > 0) {
        const titleElement = slide.pageElements.find((element: any) => 
          element.shape && element.shape.shapeType === 'TEXT_BOX' && 
          element.shape.text && element.shape.text.textElements
        );
        
        if (titleElement && titleElement.shape.text.textElements) {
          const titleText = titleElement.shape.text.textElements
            .filter((textElement: any) => textElement.textRun && textElement.textRun.content)
            .map((textElement: any) => textElement.textRun.content)
            .join("");
          
          if (titleText.trim()) {
            slideTitle = titleText.trim();
            extractedText += `タイトル: ${slideTitle}\n`;
          }
        }
      }
      
      // すべてのページ要素からテキストを抽出
      if (slide.pageElements) {
        slide.pageElements.forEach((element: any) => {
          if (element.shape && element.shape.text && element.shape.text.textElements) {
            // テキスト要素から内容を取得
            const elementText = element.shape.text.textElements
              .filter((textElement: any) => textElement.textRun && textElement.textRun.content)
              .map((textElement: any) => textElement.textRun.content)
              .join("");
            
            if (elementText.trim() && elementText.trim() !== slideTitle) {
              extractedText += elementText;
            }
          }
          
          // テーブルのテキストを抽出
          if (element.table && element.table.tableRows) {
            element.table.tableRows.forEach((row: any) => {
              if (row.tableCells) {
                const rowText = row.tableCells
                  .map((cell: any) => {
                    if (cell.text && cell.text.textElements) {
                      return cell.text.textElements
                        .filter((textElement: any) => textElement.textRun && textElement.textRun.content)
                        .map((textElement: any) => textElement.textRun.content)
                        .join("");
                    }
                    return "";
                  })
                  .filter((text: string) => text.trim())
                  .join(" | ");
                
                if (rowText.trim()) {
                  extractedText += `${rowText}\n`;
                }
              }
            });
          }
        });
      }
      
      // スライドノートがあれば抽出
      if (slide.slideProperties && slide.slideProperties.notesPage && 
          slide.slideProperties.notesPage.pageElements) {
        const notes = slide.slideProperties.notesPage.pageElements
          .filter((element: any) => 
            element.shape && element.shape.shapeType === 'TEXT_BOX' && 
            element.shape.text && element.shape.text.textElements
          )
          .map((element: any) => {
            return element.shape.text.textElements
              .filter((textElement: any) => textElement.textRun && textElement.textRun.content)
              .map((textElement: any) => textElement.textRun.content)
              .join("");
          })
          .filter((text: string) => text.trim())
          .join("\n");
        
        if (notes.trim()) {
          extractedText += `\nノート:\n${notes.trim()}\n`;
        }
      }
      
      extractedText += "\n\n";
    });
    
    return extractedText;
  } catch (error) {
    console.error("スライドテキスト抽出エラー:", error);
    throw error;
  }
}

// Googleスライドのテキストのみを取得するツール
server.tool(
  "g_drive_get_presentation_text",
  "Googleスライドに含まれるテキストデータのみを取得する",
  {
    presentationId: z.string().describe("スライドのID"),
  },
  async ({ presentationId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const textContent = await getPresentationText(auth, presentationId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              text: textContent
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スライドのテキスト取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleドキュメントのテキストのみを抽出する関数
async function getDocumentText(auth: OAuth2Client, documentId: string): Promise<string> {
  try {
    // ドキュメント全体を取得
    const document = await getDocContent(auth, documentId);
    
    // テキスト抽出結果
    let extractedText = "";
    
    // タイトルを追加
    if (document.title) {
      extractedText += `タイトル: ${document.title}\n\n`;
    }
    
    // ドキュメントが存在しない場合
    if (!document.body || !document.body.content) {
      return extractedText + "ドキュメントの内容が存在しません。";
    }
    
    // ドキュメント内の各要素からテキストを抽出
    for (const element of document.body.content) {
      // 段落要素の場合
      if (element.paragraph) {
        const paragraph = element.paragraph;
        
        // 段落スタイルの情報を確認
        const paragraphStyle = paragraph.paragraphStyle || {};
        const namedStyleType = paragraphStyle.namedStyleType || "";
        
        // 見出しスタイルの場合は特別な表示を追加
        if (namedStyleType.includes("HEADING")) {
          extractedText += "\n"; // 見出し前に空行を追加
        }
        
        // 段落内の各要素（テキスト実行など）からテキストを抽出
        let paragraphText = "";
        if (paragraph.elements) {
          for (const textElement of paragraph.elements) {
            if (textElement.textRun && textElement.textRun.content) {
              paragraphText += textElement.textRun.content;
            }
          }
        }
        
        // 段落テキストを追加
        extractedText += paragraphText;
        
        // 見出しスタイルの場合は特別な表示を追加
        if (namedStyleType.includes("HEADING")) {
          extractedText += "\n"; // 見出し後に空行を追加
        }
      }
      
      // テーブル要素の場合
      else if (element.table) {
        const table = element.table;
        extractedText += "\n"; // テーブル前に空行を追加
        
        // テーブルの行ごとに処理
        if (table.tableRows) {
          for (const row of table.tableRows) {
            let rowText = "";
            
            // 行内のセルごとに処理
            if (row.tableCells) {
              for (const cell of row.tableCells) {
                let cellText = "";
                
                // セル内のコンテンツを処理
                if (cell.content) {
                  for (const content of cell.content) {
                    if (content.paragraph && content.paragraph.elements) {
                      for (const textElement of content.paragraph.elements) {
                        if (textElement.textRun && textElement.textRun.content) {
                          cellText += textElement.textRun.content.trim();
                        }
                      }
                    }
                  }
                }
                
                // セルテキストをパイプ区切りで追加
                rowText += (rowText ? " | " : "") + cellText;
              }
            }
            
            // 行テキストを追加
            if (rowText) {
              extractedText += rowText + "\n";
            }
          }
        }
        
        extractedText += "\n"; // テーブル後に空行を追加
      }
      
      // リスト要素の場合
      else if (element.paragraph && element.paragraph.bullet) {
        const paragraph = element.paragraph;
        const bullet = paragraph.bullet;
        
        // リストアイテムのテキストを抽出
        let listItemText = "";
        if (paragraph.elements) {
          for (const textElement of paragraph.elements) {
            if (textElement.textRun && textElement.textRun.content) {
              listItemText += textElement.textRun.content;
            }
          }
        }
        
        // ネストレベルに応じたインデントを追加
        const nestingLevel = bullet.nestingLevel || 0;
        const indent = "  ".repeat(nestingLevel);
        
        // 箇条書きスタイルを適用
        extractedText += `${indent}• ${listItemText}`;
      }
    }
    
    // 余分な改行を整理
    extractedText = extractedText.replace(/\n\n\n+/g, "\n\n");
    
    return extractedText;
  } catch (error) {
    console.error("ドキュメントテキスト抽出エラー:", error);
    throw error;
  }
}

// Googleドキュメントのテキストのみを取得するツール
server.tool(
  "g_drive_get_doc_text",
  "Googleドキュメントに含まれるテキストデータのみを取得する",
  {
    documentId: z.string().describe("ドキュメントのID"),
  },
  async ({ documentId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const textContent = await getDocumentText(auth, documentId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              text: textContent
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `ドキュメントのテキスト取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Googleスプレッドシートのテキストのみを抽出する関数
async function getSpreadsheetText(auth: OAuth2Client, spreadsheetId: string): Promise<string> {
  try {
    // スプレッドシートの全シートデータを取得
    const allSheetsData = await getAllSheetsData(auth, spreadsheetId);
    
    // スプレッドシートのメタデータを取得してタイトルを表示
    const sheets = google.sheets({ version: "v4", auth });
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

// Googleスプレッドシートのテキストのみを取得するツール
server.tool(
  "g_drive_get_spreadsheet_text",
  "Googleスプレッドシートのテキストのみを取得する",
  {
    spreadsheetId: z.string().describe("スプレッドシートのID"),
  },
  async ({ spreadsheetId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const textContent = await getSpreadsheetText(auth, spreadsheetId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              text: textContent
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `スプレッドシートのテキスト取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// GoogleドライブのPDFテキストを取得するツール
server.tool(
  "g_drive_get_pdf_text",
  "GoogleドライブにあるPDFファイルのテキスト情報を取得する",
  {
    fileId: z.string().describe("PDFファイルのID"),
  },
  async ({ fileId }) => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        return {
          content: [
            {
              type: "text",
              text: "Google認証に失敗しました。認証情報とトークンを確認してください。",
            },
          ],
          isError: true
        };
      }

      const textContent = await getPdfText(auth, fileId);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              text: textContent
            }, null, 2)
          }
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `PDFファイルのテキスト取得に失敗しました: ${error.message || String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// メイン関数
async function main() {
  try {
    console.log("mcp-google-drive サーバーを起動中...");
    
    // 標準入出力を使用したトランスポートの作成
    const transport = new StdioServerTransport();
    
    // サーバーの起動（修正版 - 最新SDKに対応）
    await server.connect(transport);
    
    console.log("サーバーが正常に起動しました");
  } catch (error) {
    console.error("サーバー起動エラー:", error);
    process.exit(1);
  }
}

// サーバーの起動
main(); 