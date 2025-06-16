import express from 'express';
import cors from 'cors';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerDriveTools } from "./tools/drive.tools.js";
import { oidcAuthService } from "./services/oidc-auth.service.js";
import { GoogleAuth } from "google-auth-library";
import { OAuth2Client } from "google-auth-library";

// Express アプリケーション
let app: express.Application;

// SSEトランスポートの管理
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

  // 認証クライアントを取得する関数
  async function getAuthClient(req?: express.Request) {
    try {
      // Cloud Run環境では常にサービスアカウント認証を使用
      if (oidcAuthService.isCloudRun()) {
        // Application Default Credentials (ADC) を使用してサービスアカウント認証
        const auth = new GoogleAuth({
          scopes: [
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/spreadsheets", 
            "https://www.googleapis.com/auth/documents"
          ]
        });
        
        const authClient = await auth.getClient() as OAuth2Client;
        console.log('✅ Cloud Run サービスアカウント認証が成功しました');
        return authClient;
      } else {
        // ローカル環境では ADC またはサービスアカウントキーを使用
        const auth = new GoogleAuth({
          scopes: [
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/documents"
          ]
        });
        
        const authClient = await auth.getClient() as OAuth2Client;
        console.log('✅ ローカル認証が成功しました');
        return authClient;
      }
    } catch (error) {
      console.error('❌ Google API認証に失敗:', error);
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
      environment: oidcAuthService.isCloudRun() ? 'Cloud Run' : 'Local',
      authentication: 'OIDC ID Token (Query Parameter)',
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
      environment: oidcAuthService.isCloudRun() ? 'Google Cloud Run' : 'Local',
      authentication: 'OIDC ID Token (Query Parameter Only)',
      endpoints: {
        sse: 'GET /mcp?token=TOKEN - SSE接続を確立（クエリパラメータ認証）',
        messages: 'POST /messages - メッセージを送信',
        health: 'GET /health - ヘルスチェック'
      },
      description: 'Google Drive API へのアクセスを提供するMCPサーバー（SSE専用・クエリパラメータ認証）',
      authMethod: {
        method: 'Query Parameter',
        example: '/mcp?token=YOUR_OIDC_ID_TOKEN'
      },
      getToken: 'gcloud auth print-identity-token',
      activeSessions: transports.size,
      timestamp: new Date().toISOString()
    });
  });

  // SSE エンドポイント - SSE接続を確立
  app.all('/mcp', async (req, res) => {
    try {
      // OidcAuthServiceを使用した認証チェック
      const isAuthenticated = await oidcAuthService.checkQueryParameterAuth(req);
      if (!isAuthenticated) {
        console.log(`🔍 認証失敗: ${req.method} ${req.url}`);
        return res.status(401).json(oidcAuthService.createAuthErrorResponse());
      }

      const authMethod = oidcAuthService.isCloudRun() ? 'クエリパラメータ認証' : 'ローカル開発（認証なし）';
      console.log(`🔗 SSE接続を確立中 (${req.method}): ${authMethod}`);
      
      // SSEトランスポートの作成
      const transport = new SSEServerTransport('/messages', res);
      
      // トランスポートをマップに保存
      transports.set(transport.sessionId, transport);
      
      // 接続が閉じられた時のクリーンアップ
      res.on('close', () => {
        console.log(`🔌 SSE接続が閉じられました: ${transport.sessionId}`);
        transports.delete(transport.sessionId);
      });

      res.on('error', (error) => {
        console.error(`❌ SSE接続エラー: ${transport.sessionId}`, error);
        transports.delete(transport.sessionId);
      });
      
      // MCPサーバーの作成と接続
      const server = createMcpServer();
      await server.connect(transport);
      
      console.log(`✅ SSE接続が確立されました: ${transport.sessionId} (${authMethod})`);
      
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

  // メッセージエンドポイント - MCPメッセージを受信・処理
  app.post('/messages', async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      
      if (!sessionId) {
        console.log('❌ セッションIDが指定されていません');
        return res.status(400).json({ error: 'セッションIDが指定されていません' });
      }
      
      // トランスポートを取得
      const transport = transports.get(sessionId);
      if (!transport) {
        console.log(`❌ 無効なセッションID: ${sessionId}`);
        return res.status(404).json({ error: '無効なセッションIDです' });
      }
      
      // MCPメッセージをトランスポートに転送
      const messageData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      transport.handleMessage(messageData);
      
      // 成功レスポンスを返す
      res.status(200).json({ status: 'Message sent to transport' });
      
    } catch (error) {
      console.error('❌ メッセージ処理エラー:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'メッセージ処理に失敗しました',
          details: error.message 
        });
      }
    }
  });

  // OPTIONS リクエストの処理（CORS対応）
  app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control');
    res.sendStatus(200);
  });
}

// HTTPサーバーの起動
async function startHttpServer() {
  const PORT = parseInt(process.env.PORT || '8080', 10);
  
  setupHttpServer();
  
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ MCP Google Drive Server が起動しました`);
      console.log(`🌐 ポート: ${PORT}`);
      console.log(`🔧 環境: ${oidcAuthService.isCloudRun() ? 'Google Cloud Run' : 'Local'}`);
      console.log(`🔐 認証: ${oidcAuthService.isCloudRun() ? 'OIDC ID Token (Query Parameter)' : 'ローカル開発（認証なし）'}`);
      console.log(`📡 SSEエンドポイント: ${oidcAuthService.isCloudRun() ? 'Cloud Run URL' : `http://localhost:${PORT}`}/mcp`);
      console.log(`💬 メッセージエンドポイント: ${oidcAuthService.isCloudRun() ? 'Cloud Run URL' : `http://localhost:${PORT}`}/messages`);
      console.log(`🏥 ヘルスチェック: ${oidcAuthService.isCloudRun() ? 'Cloud Run URL' : `http://localhost:${PORT}`}/health`);
      resolve();
    });
    
    server.on('error', (error) => {
      console.error('❌ サーバー起動エラー:', error);
      reject(error);
    });
  });
}

// シャットダウンハンドラーの設定
function setupShutdownHandlers() {
  const shutdown = () => {
    console.log('\n🔄 サーバーを停止中...');
    
    // アクティブなSSE接続をクリーンアップ
    for (const [sessionId, transport] of transports) {
      console.log(`🔌 セッションを終了中: ${sessionId}`);
      try {
        if (transport && typeof transport.close === 'function') {
          transport.close();
        }
      } catch (error) {
        console.error(`❌ セッション終了エラー: ${sessionId}`, error);
      }
    }
    transports.clear();
    
    console.log('✅ サーバーが正常に停止しました');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// メイン実行関数
async function main() {
  try {
    console.log('🚀 MCP Google Drive Server を起動中...');
    
    // Cloud Run環境でのOIDC認証チェック
    if (oidcAuthService.isCloudRun()) {
      console.log('🌐 Cloud Run環境を検出しました');
      console.log('🔐 OIDC IDトークン認証が必要です（クエリパラメータ）');
    } else {
      console.log('💻 ローカル開発環境を検出しました');
      console.log('⚠️ 認証は無効化されます');
    }
    
    // シャットダウンハンドラーの設定
    setupShutdownHandlers();
    
    // HTTPサーバーの起動
    await startHttpServer();
    
  } catch (error) {
    console.error('❌ サーバー起動に失敗しました:', error);
    process.exit(1);
  }
}

// メイン実行
main().catch((error) => {
  console.error('❌ 予期しないエラーが発生しました:', error);
  process.exit(1);
}); 