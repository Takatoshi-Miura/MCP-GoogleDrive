#!/usr/bin/env node

// 認証処理を実行
console.log('Google API認証トークン生成ツール');
console.log('================================');

console.log('手動認証モードを開始します...');
import('./build/generate-token.js')
  .then((module) => {
    // --manualフラグを付けて実行
    if (module.default) {
      module.default('--manual');
    } else {
      console.log('認証プロセスを実行中...');
    }
  })
  .catch((error) => {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }); 