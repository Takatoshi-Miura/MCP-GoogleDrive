#!/usr/bin/env node

// 認証処理を実行
console.log('Google API認証トークン生成ツール');
console.log('================================');

console.log('自動認証を開始します...');
import('./build/generate-token.js')
  .then((module) => {
    if (module.default) {
      module.default();
    } else {
      // デフォルトエクスポートがない場合
      console.log('認証プロセスを実行中...');
    }
  })
  .catch((error) => {
    console.error('エラーが発生しました:', error);
    // 自動認証に失敗した場合
    console.log('\n手動認証に切り替えます...');
    // 再度実行（--autoフラグなし）
    import('./build/generate-token.js')
      .then(() => {
        // generate-token.js側で処理が行われるため、ここでは何もしない
      })
      .catch((error) => {
        console.error('手動認証でもエラーが発生しました:', error);
        process.exit(1);
      });
  }); 