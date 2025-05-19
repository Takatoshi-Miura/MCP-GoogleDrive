import { OAuth2Client } from "google-auth-library";
import { createOAuth2Client, getAuthUrl, getTokenFromCode } from "./auth.js";
import readline from "readline";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ESM用にファイルパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// トークンファイルのパスを設定
const TOKEN_PATH = process.env.TOKEN_PATH || path.join(__dirname, "../credentials/token.json");

// 標準入力から読み込むためのインターフェースを作成
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 認証コードを入力させる関数
function askForAuthCode(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// トークン生成コマンドを実行する関数
async function manualGenerateToken(): Promise<void> {
  try {
    console.log("\n手動認証モードを開始します");
    console.log("================================");
    
    // OAuth2クライアントを作成
    const oAuth2Client = createOAuth2Client();
    if (!oAuth2Client) {
      console.error("OAuth2クライアントの作成に失敗しました。認証情報ファイルを確認してください。");
      process.exit(1);
    }
    
    // 認証URLを生成
    const redirectUri = "http://localhost:3000";
    const authUrl = getAuthUrl(oAuth2Client, redirectUri);
    
    console.log("以下のURLをブラウザで開いて認証してください:");
    console.log(authUrl);
    console.log("\n認証後にリダイレクトされたURLからcode=の後の部分をコピーしてください。");
    
    // ユーザーに認証コードを入力してもらう
    const authCode = await askForAuthCode("認証コードを入力してください: ");
    
    if (!authCode) {
      console.error("認証コードが入力されていません。");
      process.exit(1);
    }
    
    // 認証コードからトークンを取得
    await getTokenFromCode(oAuth2Client, authCode, redirectUri);
    
    console.log(`トークンが正常に保存されました: ${TOKEN_PATH}`);
  } catch (error) {
    console.error("トークン生成エラー:", error);
    throw error;
  } finally {
    rl.close();
  }
}

// メイン関数を実行
async function main(): Promise<void> {
  await manualGenerateToken();
}

// メイン関数を実行
main()
  .then(() => {
    console.log("認証プロセスが完了しました。");
    process.exit(0);
  })
  .catch(error => {
    console.error("認証プロセス中にエラーが発生しました:", error);
    process.exit(1);
  }); 