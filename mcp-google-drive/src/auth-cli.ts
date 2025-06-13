#!/usr/bin/env node

import { authService } from "./services/auth.service.js";

/**
 * 認証関連のCLIスクリプト
 */
async function main() {
  const command = process.argv[2];
  
  try {
    switch (command) {
      case "auto-auth":
        console.log("=================================");
        console.log("Google Drive 自動認証を開始します");
        console.log("=================================\n");
        await authService.runAutoAuth();
        console.log("\n認証プロセスが完了しました。");
        break;
        
      case "check":
        console.log("OAuth設定をチェックしています...");
        const isValid = authService.checkOAuthSetup();
        process.exit(isValid ? 0 : 1);
        break;
        
      case "info":
        authService.showOAuthInfo();
        break;
        
      default:
        console.log(`
🔧 MCP-GoogleDrive 認証CLI
==========================

使用方法:
  npm run auto-auth    # 自動認証を実行
  npm run check-oauth  # OAuth設定をチェック
  npm run oauth-info   # OAuth設定の詳細を表示

直接実行する場合:
  node build/auth-cli.js auto-auth
  node build/auth-cli.js check
  node build/auth-cli.js info
`);
        break;
    }
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    process.exit(1);
  }
}

// メイン関数を実行
main(); 