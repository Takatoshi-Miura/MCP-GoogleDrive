import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { authService } from "./services/auth.service.js";
import { registerDriveTools } from "./tools/drive.tools.js";

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  return authService.authorize();
}

// ツールの登録
registerDriveTools(server, getAuthClient);

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