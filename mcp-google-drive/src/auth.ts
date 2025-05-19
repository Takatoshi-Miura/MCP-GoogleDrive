import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

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

/**
 * 認証情報からOAuth2クライアントを作成
 */
export function createOAuth2Client(): OAuth2Client | null {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error(`認証情報ファイルが見つかりません: ${CREDENTIALS_PATH}`);
      return null;
    }

    const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const credentials = JSON.parse(credentialsContent);
    
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    return new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );
  } catch (error) {
    console.error("OAuth2クライアント作成エラー:", error);
    return null;
  }
}

/**
 * 認証用URLを生成
 */
export function getAuthUrl(oAuth2Client: OAuth2Client, redirectUri: string): string {
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    redirect_uri: redirectUri,
    prompt: "consent" // トークンを強制的に再取得するためにconsentを指定
  });
}

/**
 * 認証コードからトークンを取得してファイルに保存
 */
export async function getTokenFromCode(oAuth2Client: OAuth2Client, code: string, redirectUri: string): Promise<void> {
  try {
    const { tokens } = await oAuth2Client.getToken({
      code: code,
      redirect_uri: redirectUri
    });
    oAuth2Client.setCredentials(tokens);
    
    // トークンをファイルに保存
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log(`トークンが保存されました: ${TOKEN_PATH}`);
  } catch (error) {
    console.error("トークン取得エラー:", error);
    throw error;
  }
}

/**
 * 保存されたトークンからOAuth2クライアントを取得
 */
export async function authorize(): Promise<OAuth2Client | null> {
  const oAuth2Client = createOAuth2Client();
  if (!oAuth2Client) return null;
  
  // トークンファイルがすでに存在するか確認
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const tokenContent = fs.readFileSync(TOKEN_PATH, "utf8");
      const token = JSON.parse(tokenContent);
      oAuth2Client.setCredentials(token);
      
      // トークンが有効期限切れかどうか確認
      const currentTime = Date.now();
      if (token.expiry_date && token.expiry_date > currentTime) {
        return oAuth2Client;
      } else if (token.refresh_token) {
        // リフレッシュトークンがある場合は更新を試みる
        try {
          const { credentials } = await oAuth2Client.refreshAccessToken();
          oAuth2Client.setCredentials(credentials);
          
          // 更新したトークンを保存
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials));
          return oAuth2Client;
        } catch (refreshError) {
          console.error("トークン更新エラー:", refreshError);
          return null;
        }
      }
    } catch (error) {
      console.error("トークン読み込みエラー:", error);
    }
  }
  
  // トークンファイルがない場合、nullを返す
  console.log("トークンファイルが見つかりません。手動認証を実行してください。");
  return null;
} 