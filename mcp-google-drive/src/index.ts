import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { authService } from "./services/auth.service.js";
import { firebaseService } from "./services/firebase.service.js";
import { registerDriveTools } from "./tools/drive.tools.js";

// HTTPサーバー用の変数
let app: express.Application;
const transports: Map<string, SSEServerTransport> = new Map();

// Cloud Run環境の検出
const isCloudRun = process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION;

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
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control'],
    credentials: false
  }));
  app.use(express.json());

  // ヘルスチェックエンドポイント
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      server: 'mcp-google-drive',
      version: '1.0.0',
      transport: 'SSE',
      environment: isCloudRun ? 'Cloud Run' : 'Local',
      activeSessions: transports.size,
      timestamp: new Date().toISOString()
    });
  });

  // サーバー情報エンドポイント
  app.get('/', (req, res) => {
    res.status(200).json({
      name: 'MCP Google Drive Server',
      version: '1.0.0', 
      transport: 'Server-Sent Events (SSE)',
      environment: isCloudRun ? 'Google Cloud Run' : 'Local',
      endpoints: {
        sse: 'GET /mcp - SSE接続を確立',
        messages: 'POST /messages - メッセージを送信',
        health: 'GET /health - ヘルスチェック'
      },
      description: 'Google Drive API へのアクセスを提供するMCPサーバー（SSE専用）',
      activeSessions: transports.size,
      timestamp: new Date().toISOString()
    });
  });

  // SSE エンドポイント (GET) - SSE接続を確立（Cloud Runのみ Firebase認証付き）
  app.get('/mcp', isCloudRun ? firebaseService.authMiddleware() : (req, res, next) => next(), async (req, res) => {
    try {
      const user = (req as any).user;
      const userInfo = firebaseService.isFirebaseEnabled() && user ? 
        `${user.email} (${user.uid})` : 'Anonymous';
      console.log(`🔗 SSE接続を確立中: ${userInfo}`);
      
      // SSEトランスポートの作成
      const transport = new SSEServerTransport('/messages', res);
      
      // トランスポートをマップに保存
      transports.set(transport.sessionId, transport);
      
      // 接続が閉じられた時のクリーンアップ
      res.on('close', () => {
        console.log(`🔌 SSE接続が閉じられました: ${transport.sessionId} (${userInfo})`);
        transports.delete(transport.sessionId);
      });

      res.on('error', (error) => {
        console.error(`❌ SSE接続エラー: ${transport.sessionId} (${userInfo})`, error);
        transports.delete(transport.sessionId);
      });
      
      // MCPサーバーの作成と接続
      const server = createMcpServer();
      await server.connect(transport);
      
      console.log(`✅ SSE接続が確立されました: ${transport.sessionId} (${userInfo})`);
      
    } catch (error) {
      console.error('❌ SSE接続の確立に失敗:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'SSE接続の確立に失敗しました',
          details: error.message 
        });
      }
    }
  });

  // メッセージエンドポイント (POST) - クライアントからのメッセージを受信（Cloud Runのみ Firebase認証付き）
  app.post('/messages', isCloudRun ? firebaseService.authMiddleware() : (req, res, next) => next(), async (req, res) => {
    try {
      const user = (req as any).user;
      const userInfo = firebaseService.isFirebaseEnabled() && user ? 
        `${user.email} (${user.uid})` : 'Anonymous';
      console.log(`📨 メッセージを受信: ${userInfo}`, JSON.stringify(req.body, null, 2));
      
      // セッションIDの取得（クエリパラメータから）
      const sessionId = req.query.sessionId as string;
      
      if (!sessionId) {
        console.error(`❌ セッションIDが見つかりません (${userInfo})`);
        return res.status(400).json({ 
          error: 'セッションIDが必要です',
          details: 'sessionIdをクエリパラメータで指定してください'
        });
      }
      
      const transport = transports.get(sessionId);
      if (!transport) {
        console.error(`❌ セッションが見つかりません: ${sessionId} (${userInfo})`);
        return res.status(404).json({ 
          error: 'セッションが見つかりません',
          sessionId: sessionId,
          availableSessions: Array.from(transports.keys())
        });
      }
      
      // SSEServerTransportのhandlePostMessageメソッドを使用
      await transport.handlePostMessage(req, res, req.body);
      
    } catch (error) {
      console.error('❌ メッセージ処理エラー:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'メッセージの処理に失敗しました',
          details: error.message
        });
      }
    }
  });

  // OPTIONS リクエストの処理（CORS対応）
  app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control, X-Session-Id');
    res.sendStatus(200);
  });
}

// HTTPサーバーの起動
async function startHttpServer() {
  const PORT = parseInt(process.env.PORT || '8080', 10);
  
  setupHttpServer();
  
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ MCP Google Drive Server (SSE) が起動しました`);
      console.log(`🌐 ポート: ${PORT}`);
      console.log(`🔧 環境: ${isCloudRun ? 'Google Cloud Run' : 'Local'}`);
      console.log(`📡 SSEエンドポイント: ${isCloudRun ? 'Cloud Run URL' : `http://localhost:${PORT}`}/mcp`);
      console.log(`💬 メッセージエンドポイント: ${isCloudRun ? 'Cloud Run URL' : `http://localhost:${PORT}`}/messages`);
      console.log(`🏥 ヘルスチェック: ${isCloudRun ? 'Cloud Run URL' : `http://localhost:${PORT}`}/health`);
      resolve();
    });
    
    server.on('error', (error) => {
      console.error('❌ サーバー起動エラー:', error);
      reject(error);
    });
  });
}

// グレースフルシャットダウンの処理
function setupShutdownHandlers() {
  const shutdown = () => {
    console.log('\n🛑 シャットダウン中...');
    
    // 全てのSSE接続を閉じる
    transports.forEach((transport, sessionId) => {
      console.log(`🔌 セッションを終了中: ${sessionId}`);
      transport.close();
    });
    transports.clear();
    
    console.log('✅ サーバーが正常に終了しました');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// メイン関数
async function main() {
  try {
    console.log(`🚀 MCP Google Drive Server (SSE専用) を起動中...`);
    console.log(`🔧 環境: ${isCloudRun ? 'Google Cloud Run' : 'Local'}`);
    console.log(`📡 ポート: ${process.env.PORT || '8080'}`);
    
    // シャットダウンハンドラーの設定
    setupShutdownHandlers();
    
    // HTTPサーバーの起動
    await startHttpServer();
    
  } catch (error) {
    console.error("❌ サーバー起動エラー:", error);
    process.exit(1);
  }
}

// サーバーの起動
main(); 