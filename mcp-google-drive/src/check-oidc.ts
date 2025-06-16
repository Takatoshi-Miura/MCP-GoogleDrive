import { oidcAuthService } from "./services/oidc-auth.service.js";

/**
 * OIDC認証のセットアップ状況を確認するスクリプト
 */
async function checkOidcSetup() {
  console.log('🔐 OIDC IDトークン認証のセットアップ状況を確認中...\n');
  
  try {
    // 基本的なセットアップチェック
    const isSetupValid = oidcAuthService.checkSetup();
    
    // 環境変数の確認
    const envVariables = {
      'GOOGLE_OIDC_TOKEN': process.env.GOOGLE_OIDC_TOKEN,
      'MCP_GOOGLE_OIDC_TOKEN': process.env.MCP_GOOGLE_OIDC_TOKEN,
      'K_SERVICE': process.env.K_SERVICE,
      'K_REVISION': process.env.K_REVISION,
      'K_CONFIGURATION': process.env.K_CONFIGURATION,
      'PORT': process.env.PORT
    };
    
    console.log('\n📋 環境変数の状況:');
    console.log('==================');
    
    for (const [key, value] of Object.entries(envVariables)) {
      if (value) {
        if (key.includes('TOKEN')) {
          // トークンは部分的にマスク
          const maskedValue = value.length > 20 ? 
            `${value.substring(0, 10)}...${value.substring(value.length - 10)}` : 
            '***マスクされています***';
          console.log(`✅ ${key}: ${maskedValue}`);
        } else {
          console.log(`✅ ${key}: ${value}`);
        }
      } else {
        console.log(`❌ ${key}: 未設定`);
      }
    }
    
    // 実行環境の判定
    const isCloudRun = !!(process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION);
    const hasOidcToken = !!(process.env.GOOGLE_OIDC_TOKEN || process.env.MCP_GOOGLE_OIDC_TOKEN);
    
    console.log('\n🌍 実行環境の分析:');
    console.log('==================');
    console.log(`実行環境: ${isCloudRun ? 'Google Cloud Run' : 'ローカル開発'}`);
    console.log(`OIDC認証: ${hasOidcToken ? '有効' : '無効'}`);
    
    if (isCloudRun && hasOidcToken) {
      console.log('✅ Cloud Run環境でOIDC認証が正しく設定されています');
    } else if (!isCloudRun) {
      console.log('⚠️ ローカル開発環境では認証はスキップされます');
    } else {
      console.log('❌ Cloud Run環境ですがOIDC IDトークンが設定されていません');
    }
    
    // Cursorでの利用例を表示
    console.log('\n📝 Cursorでの利用例:');
    console.log('==================');
    
    if (hasOidcToken) {
      console.log('mcp.json に以下のように設定してください:');
      console.log(`
{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://your-cloud-run-url/mcp?token=YOUR_OIDC_ID_TOKEN"
    }
  }
}

または Authorization ヘッダーを使用:

{
  "mcpServers": {
    "mcp-google-drive": {
      "url": "https://your-cloud-run-url/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_OIDC_ID_TOKEN"
      }
    }
  }
}`);
    } else {
      console.log('まず OIDC IDトークンを取得してください:');
      console.log(`
# Google Cloud SDK を使用:
gcloud auth print-identity-token --audiences=https://your-cloud-run-url

# 環境変数として設定:
export GOOGLE_OIDC_TOKEN="取得したIDトークン"
`);
    }
    
    // 認証テスト
    console.log('\n🧪 認証テスト:');
    console.log('=============');
    
    try {
      const authClient = await oidcAuthService.authorize();
      if (authClient) {
        console.log('✅ OIDC認証クライアントの作成に成功しました');
      } else {
        console.log('❌ OIDC認証クライアントの作成に失敗しました');
      }
    } catch (error) {
      console.log('❌ 認証テストでエラーが発生しました:', error.message);
    }
    
    console.log('\n🏁 セットアップ確認完了');
    
  } catch (error) {
    console.error('❌ セットアップ確認中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  checkOidcSetup().catch((error) => {
    console.error('❌ 予期しないエラーが発生しました:', error);
    process.exit(1);
  });
} 