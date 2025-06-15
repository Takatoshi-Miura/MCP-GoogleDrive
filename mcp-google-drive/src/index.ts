import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { authService } from "./services/auth.service.js";
import { registerDriveTools } from "./tools/drive.tools.js";

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 実行モードの判定（Cloud Run対応）
const isCloudRun = process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION;
const isHttpMode = process.env.MCP_TRANSPORT === 'http' || 
                  process.argv.includes('--http') || 
                  process.argv.includes('--http-mode') ||
                  isCloudRun; // Cloud Run環境では自動的にHTTPモード

// HTTPモード用の変数
let app: express.Application;
const transports: Map<string, SSEServerTransport> = new Map();

// MCPサーバーの作成
function createMcpServer() {
  const server = new McpServer({
    name: "mcp-google-drive",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  // Google認証用クライアントの取得（エラー処理付き）
  async function getAuthClient() {
    try {
      return await authService.authorize();
    } catch (error) {
      console.warn('Google認証の取得に失敗しました:', error.message);
      console.warn('認証が必要な操作は制限されます');
      return null;
    }
  }

  // ツールの登録
  registerDriveTools(server, getAuthClient);
  
  return server;
}

// HTTPサーバーのセットアップ
function setupHttpServer() {
  app = express();
  
  // ミドルウェアの設定
  app.use(cors());
  app.use(express.json());

  // Cloud Run用のヘルスチェックエンドポイント（優先度を上げる）
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      server: 'mcp-google-drive',
      version: '1.0.0',
      transport: 'HTTP-SSE',
      environment: isCloudRun ? 'Cloud Run' : 'Local',
      activeSessions: transports.size,
      timestamp: new Date().toISOString()
    });
  });

  // Cloud Run用のルートヘルスチェック
  app.get('/', (req, res) => {
    res.status(200).json({
      name: 'MCP Google Drive Server',
      version: '1.0.0', 
      transport: 'HTTP Server-Sent Events (SSE)',
      environment: isCloudRun ? 'Google Cloud Run' : 'Local',
      endpoints: {
        sse: 'GET /mcp - SSE接続を確立',
        messages: 'POST /messages?sessionId=<id> - メッセージを送信',
        health: 'GET /health - ヘルスチェック'
      },
      description: 'Google Drive API へのアクセスを提供するMCPサーバー',
      activeSessions: transports.size,
      timestamp: new Date().toISOString()
    });
  });

  // SSE エンドポイント (GET) - SSE接続を確立
  app.get('/mcp', async (req, res) => {
    try {
      console.log('SSE接続を確立中...');
      
      // SSEトランスポートの作成
      const transport = new SSEServerTransport('/messages', res);
      
      // トランスポートをマップに保存
      transports.set(transport.sessionId, transport);
      
      // 接続が閉じられた時のクリーンアップ
      res.on('close', () => {
        console.log(`SSE接続が閉じられました: ${transport.sessionId}`);
        transports.delete(transport.sessionId);
      });
      
      // MCPサーバーの作成と接続
      const server = createMcpServer();
      await server.connect(transport);
      
      console.log(`SSE接続が確立されました: ${transport.sessionId}`);
    } catch (error) {
      console.error('SSE接続エラー:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'SSE接続の確立に失敗しました' });
      }
    }
  });

  // メッセージエンドポイント (POST) - クライアントからのメッセージを受信
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId) {
      res.status(400).json({ error: 'セッションIDが必要です' });
      return;
    }
    
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'セッションが見つかりません' });
      return;
    }
    
    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('メッセージ処理エラー:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'メッセージの処理に失敗しました' });
      }
    }
  });
}

// HTTPサーバーの起動
async function startHttpServer() {
  const PORT = parseInt(process.env.PORT || '8080', 10); // Cloud Run用にデフォルトを8080に変更
  
  setupHttpServer();
  
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => { // Cloud Run用に0.0.0.0をバインド
      console.log(`✅ HTTPストリーミングサーバーが起動しました`);
      console.log(`🌐 ポート: ${PORT}`);
      console.log(`🔧 環境: ${isCloudRun ? 'Google Cloud Run' : 'Local'}`);
      if (!isCloudRun) {
        console.log(`📡 SSEエンドポイント: http://localhost:${PORT}/mcp`);
        console.log(`💬 メッセージエンドポイント: http://localhost:${PORT}/messages`);
        console.log(`🏥 ヘルスチェック: http://localhost:${PORT}/health`);
        console.log(`📊 サーバー情報: http://localhost:${PORT}/`);
      }
      resolve();
    });
    
    server.on('error', (error) => {
      console.error('サーバー起動エラー:', error);
      reject(error);
    });
  });
}

// stdioサーバーの起動
async function startStdioServer() {
  console.log("mcp-google-drive サーバーを起動中... (stdio mode)");
  
  // 標準入出力を使用したトランスポートの作成
  const transport = new StdioServerTransport();
  
  // MCPサーバーの作成と接続
  const server = createMcpServer();
  await server.connect(transport);
  
  console.log("サーバーが正常に起動しました (stdio mode)");
}

// グレースフルシャットダウンの処理
function setupShutdownHandlers() {
  const shutdown = () => {
    console.log('\n🛑 シャットダウン中...');
    
    if (isHttpMode) {
      // 全てのSSE接続を閉じる
      transports.forEach((transport) => {
        transport.close();
      });
      transports.clear();
    }
    
    console.log('✅ サーバーが正常に終了しました');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// メイン関数
async function main() {
  try {
    // 環境情報をログ出力
    console.log(`🚀 起動環境: ${isCloudRun ? 'Google Cloud Run' : 'Local'}`);
    console.log(`🔧 HTTPモード: ${isHttpMode ? 'ON' : 'OFF'}`);
    console.log(`📡 ポート: ${process.env.PORT || (isHttpMode ? '8080' : 'N/A')}`);
    
    // シャットダウンハンドラーの設定
    setupShutdownHandlers();
    
    if (isHttpMode) {
      console.log("🌐 HTTPストリーミングモードで起動中...");
      await startHttpServer();
    } else {
      console.log("📱 stdioモードで起動中...");
      await startStdioServer();
    }
    
  } catch (error) {
    console.error("サーバー起動エラー:", error);
    process.exit(1);
  }
}

// サーバーの起動
main(); 