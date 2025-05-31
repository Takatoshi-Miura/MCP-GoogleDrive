// JSONを安全にパースする関数
export function safeJsonParse(str: string): any {
  if (!str) return null;
  
  try {
    // すでにオブジェクトの場合はそのまま返す
    if (typeof str === "object") return str;
    
    // 文字列の場合はパースする
    return JSON.parse(str);
  } catch (error) {
    console.error("JSONパースエラー:", error);
    return null;
  }
} 