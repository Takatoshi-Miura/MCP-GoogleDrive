const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Firebase サービスアカウントキーを読み込み
const serviceAccountPath = path.join(__dirname, 'credentials/firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Firebase サービスアカウントファイルが見つかりません:', serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// カスタムトークンを生成
function generateCustomToken() {
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1時間後
    uid: 'cursor-user-' + Date.now() + Math.floor(Math.random() * 1000),
    claims: {
      email: 'cursor@example.com',
      name: 'Cursor User', 
      role: 'mcp-client'
    }
  };

  return jwt.sign(payload, serviceAccount.private_key, { algorithm: 'RS256' });
}

console.log('🔥 Firebase カスタムトークン生成（supergateway不要版）');
const customToken = generateCustomToken();
console.log('✅ トークン生成成功');
console.log('📋 トークン:', customToken.substring(0, 80) + '...');

console.log('\n🚀 Cursor設定（クエリパラメータ認証）:');
console.log(JSON.stringify({
  "mcpServers": {
    "mcp-google-drive": {
      "url": `http://localhost:8080/mcp?token=${encodeURIComponent(customToken)}`
    }
  }
}, null, 2));

console.log('\n☁️ Cloud Run版（クエリパラメータ認証）:');
console.log(JSON.stringify({
  "mcpServers": {
    "mcp-google-drive": {
      "url": `https://mcp-google-drive-firebase-1032995804784.asia-northeast1.run.app/mcp?token=${encodeURIComponent(customToken)}`
    }
  }
}, null, 2));

console.log('\n📝 設定手順:');
console.log('1. 上記のJSON設定をCursorの mcp.json ファイルにコピー');
console.log('2. supergateway は不要です！');
console.log('3. CursorがSSE形式MCPサーバーをネイティブサポート');
console.log('4. Firebase認証でセキュアなアクセス'); 