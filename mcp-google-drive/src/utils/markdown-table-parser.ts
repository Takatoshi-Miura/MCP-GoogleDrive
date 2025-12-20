/**
 * マークダウン表形式のパーサー
 * テキスト内のマークダウン表を検出し、テキストセグメントと表セグメントに分割する
 */

// マークダウン表形式のセグメント
export interface TableSegment {
  type: 'table';
  rows: number;
  columns: number;
  cells: string[][];  // 2次元配列 [行][列]
}

// テキストセグメント
export interface TextSegment {
  type: 'text';
  content: string;
}

// パース結果の型
export type ContentSegment = TableSegment | TextSegment;

/**
 * マークダウン表の行を判定する正規表現パターン
 * 例: | ヘッダー1 | ヘッダー2 |
 */
const TABLE_ROW_PATTERN = /^\s*\|(.+)\|\s*$/;

/**
 * マークダウン表のセパレータ行を判定する正規表現パターン
 * 例: |---|---| または |:---|:---:| など
 */
const SEPARATOR_ROW_PATTERN = /^\s*\|[\s\-:|]+\|\s*$/;

/**
 * テキストにマークダウン表が含まれているかチェック
 * @param text 入力テキスト
 * @returns マークダウン表が含まれている場合はtrue
 */
export function containsMarkdownTable(text: string): boolean {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    // テーブル行かつセパレータ行でない行の後にセパレータ行が続く場合、表の開始
    if (TABLE_ROW_PATTERN.test(lines[i]) &&
        !SEPARATOR_ROW_PATTERN.test(lines[i]) &&
        SEPARATOR_ROW_PATTERN.test(lines[i + 1])) {
      return true;
    }
  }
  return false;
}

/**
 * テキスト内のマークダウン表を検出し、テキストと表に分割する
 * @param text 入力テキスト
 * @returns テキストセグメントと表セグメントの配列
 */
export function parseMarkdownContent(text: string): ContentSegment[] {
  const lines = text.split('\n');
  const segments: ContentSegment[] = [];
  let currentTextLines: string[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = TABLE_ROW_PATTERN.test(line);
    const isSeparator = SEPARATOR_ROW_PATTERN.test(line);

    if (inTable) {
      if (isTableRow || isSeparator) {
        // 表の継続
        tableLines.push(line);
      } else {
        // 表の終了
        const tableSegment = parseTableLines(tableLines);
        if (tableSegment) {
          segments.push(tableSegment);
        }
        tableLines = [];
        inTable = false;

        // 空行でなければテキストとして追加
        if (line.trim()) {
          currentTextLines.push(line);
        } else if (currentTextLines.length > 0 || segments.length > 0) {
          // 表の後の空行も保持（整形のため）
          currentTextLines.push(line);
        }
      }
    } else {
      if (isTableRow && !isSeparator) {
        // 次の行がセパレータかチェック
        const nextLine = lines[i + 1];
        if (nextLine && SEPARATOR_ROW_PATTERN.test(nextLine)) {
          // 表の開始を検出
          if (currentTextLines.length > 0) {
            // 末尾の空行を除去してテキストセグメントを追加
            const textContent = trimTrailingEmptyLines(currentTextLines).join('\n');
            if (textContent) {
              segments.push({
                type: 'text',
                content: textContent
              });
            }
            currentTextLines = [];
          }
          tableLines.push(line);
          inTable = true;
        } else {
          currentTextLines.push(line);
        }
      } else {
        currentTextLines.push(line);
      }
    }
  }

  // 残りのセグメントを処理
  if (inTable && tableLines.length > 0) {
    const tableSegment = parseTableLines(tableLines);
    if (tableSegment) {
      segments.push(tableSegment);
    }
  }

  if (currentTextLines.length > 0) {
    const textContent = trimTrailingEmptyLines(currentTextLines).join('\n');
    if (textContent) {
      segments.push({
        type: 'text',
        content: textContent
      });
    }
  }

  return segments;
}

/**
 * 表の行群をTableSegmentに変換
 * @param lines 表の行群
 * @returns TableSegment または null
 */
function parseTableLines(lines: string[]): TableSegment | null {
  if (lines.length < 2) return null;  // 最低限ヘッダー行とセパレータ行が必要

  // セパレータ行を除外してデータ行のみを取得
  const dataRows = lines.filter(line => !SEPARATOR_ROW_PATTERN.test(line));
  if (dataRows.length === 0) return null;

  // 各行をセルに分割
  const cells: string[][] = dataRows.map(line => {
    const match = line.match(TABLE_ROW_PATTERN);
    if (!match) return [];
    return match[1].split('|').map(cell => cell.trim());
  });

  // 最大列数を取得
  const columns = Math.max(...cells.map(row => row.length));

  // 列数を揃える（足りない列は空文字で補完）
  const normalizedCells = cells.map(row => {
    const newRow = [...row];
    while (newRow.length < columns) {
      newRow.push('');
    }
    return newRow;
  });

  return {
    type: 'table',
    rows: normalizedCells.length,
    columns: columns,
    cells: normalizedCells
  };
}

/**
 * 文字列配列の末尾の空行を除去
 * @param lines 文字列配列
 * @returns 末尾の空行を除去した配列
 */
function trimTrailingEmptyLines(lines: string[]): string[] {
  const result = [...lines];
  while (result.length > 0 && !result[result.length - 1].trim()) {
    result.pop();
  }
  return result;
}
