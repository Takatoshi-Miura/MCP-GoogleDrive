import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { authorize } from "./auth.js";
import { registerDriveTools } from "./tools/drive.tools.js";
import { registerSheetsTools } from "./tools/sheets.tools.js";
import { registerDocsTools } from "./tools/docs.tools.js";
import { registerSlidesTools } from "./tools/slides.tools.js";
import { registerPdfTools } from "./tools/pdf.tools.js";

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

// Google認証用クライアントの取得
async function getAuthClient() {
  return authorize();
}

// ツールの登録
registerDriveTools(server, getAuthClient);
registerSheetsTools(server, getAuthClient);
registerDocsTools(server, getAuthClient);
registerSlidesTools(server, getAuthClient);
registerPdfTools(server, getAuthClient);

// メイン関数
async function main() {
  try {
    console.log("mcp-google-drive サーバーを起動中...");
    
    // 標準入出力を使用したトランスポートの作成
    const transport = new StdioServerTransport();
    
    // サーバーの起動
    await server.connect(transport);
    
    console.log("サーバーが正常に起動しました");
  } catch (error) {
    console.error("サーバー起動エラー:", error);
    process.exit(1);
  }
}

// サーバーの起動
main(); 