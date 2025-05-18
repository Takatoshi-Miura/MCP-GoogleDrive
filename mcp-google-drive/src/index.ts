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
  "https://www.googleapis.com/auth/documents"
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