import { authenticateWithLocalAuth, authenticateWithLocalServer } from "./auth.js";
import { checkOAuthSetup } from "./setup-oauth.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// トークンファイルのパスを設定
const TOKEN_PATH = process.env.TOKEN_PATH || path.join(__dirname, "../credentials/token.json");

/**
 * 自動認証を実行する関数
 */
async function runAutoAuth(): Promise<void> {
  try {
    console.log("=================================");
    console.log("Google Drive 自動認証を開始します");
    console.log("=================================\n");
    
    // OAuth設定をチェック
    console.log("OAuth設定を確認しています...");
    if (!checkOAuthSetup()) {
      console.log("\n設定を修正してから再度実行してください。");
      process.exit(1);
    }
    
    // 既存のトークンファイルがある場合は確認
    if (fs.existsSync(TOKEN_PATH)) {
      console.log("\n既存のトークンファイルが見つかりました。");
      console.log("新しいトークンを生成すると、既存のトークンは上書きされます。");
      
      // 既存のトークンを削除
      fs.unlinkSync(TOKEN_PATH);
      console.log("既存のトークンファイルを削除しました。\n");
    }
    
    console.log("認証方法を選択してください:");
    console.log("1. Google公式ライブラリを使用（推奨）");
    console.log("2. カスタムローカルサーバーを使用");
    
    // 環境変数で認証方法を指定できるようにする
    const authMethod = process.env.AUTH_METHOD || "1";
    
    let authClient;
    
    if (authMethod === "2") {
      console.log("\nカスタムローカルサーバーを使用した認証を実行します...");
      authClient = await authenticateWithLocalServer();
    } else {
      console.log("\nGoogle公式ライブラリを使用した認証を実行します...");
      authClient = await authenticateWithLocalAuth();
    }
    
    if (authClient) {
      console.log("\n✅ 認証が正常に完了しました！");
      console.log(`📄 トークンファイル: ${TOKEN_PATH}`);
      console.log("\n🎉 これでMCPサーバーを使用する準備が整いました。");
      console.log("\n📖 使用方法:");
      console.log("   npm run build");
      console.log("   npm start");
    } else {
      console.error("\n❌ 認証に失敗しました。");
      process.exit(1);
    }
    
  } catch (error) {
    console.error("\n❌ 認証プロセス中にエラーが発生しました:", error);
    process.exit(1);
  }
}

// メイン関数を実行
runAutoAuth()
  .then(() => {
    console.log("\n認証プロセスが完了しました。");
    process.exit(0);
  })
  .catch(error => {
    console.error("\n認証プロセス中にエラーが発生しました:", error);
    process.exit(1);
  }); 