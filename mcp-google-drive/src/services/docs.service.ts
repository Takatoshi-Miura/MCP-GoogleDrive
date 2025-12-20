import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { TabInfo, DocumentInfo } from "../types/index.js";
import { parseMarkdownContent, containsMarkdownTable, TableSegment } from "../utils/markdown-table-parser.js";

export class DocsService {
  constructor(private auth: OAuth2Client) {}

  // Googleドキュメントのコメントを取得する関数
  async getDocumentComments(documentId: string) {
    try {
      const drive = google.drive({ version: 'v3', auth: this.auth });

      // Drive APIを使用してドキュメントのコメントを取得
      const commentsResponse = await drive.comments.list({
        fileId: documentId,
        fields: 'comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent,replies)',
      });

      const allComments = commentsResponse.data.comments || [];

      // コメントを整理
      const comments = allComments.map(comment => ({
        id: comment.id,
        content: comment.content,
        author: {
          displayName: comment.author?.displayName || 'Unknown',
          emailAddress: comment.author?.emailAddress || '',
          photoLink: comment.author?.photoLink || ''
        },
        createdTime: comment.createdTime,
        modifiedTime: comment.modifiedTime,
        resolved: comment.resolved || false,
        quotedFileContent: comment.quotedFileContent ? {
          mimeType: comment.quotedFileContent.mimeType,
          value: comment.quotedFileContent.value
        } : null,
        replies: comment.replies ? comment.replies.map(reply => ({
          id: reply.id,
          content: reply.content,
          author: {
            displayName: reply.author?.displayName || 'Unknown',
            emailAddress: reply.author?.emailAddress || '',
            photoLink: reply.author?.photoLink || ''
          },
          createdTime: reply.createdTime,
          modifiedTime: reply.modifiedTime
        })) : []
      }));

      return {
        status: 'success',
        documentId,
        totalComments: comments.length,
        comments: comments,
        summary: {
          resolvedComments: comments.filter(c => c.resolved).length,
          unresolvedComments: comments.filter(c => !c.resolved).length,
          totalReplies: comments.reduce((sum, c) => sum + c.replies.length, 0)
        }
      };

    } catch (error: any) {
      console.error('Error getting document comments:', error);
      return {
        status: 'error',
        error: error.message || 'Failed to get document comments',
        documentId
      };
    }
  }

  // Googleドキュメントの内容を取得する関数（タブ別にテキストを統合）
  async getDocText(documentId: string): Promise<DocumentInfo> {
    try {
      // まずドキュメントのタブ一覧を取得
      const tabs = await this.getDocumentTabs(documentId);
      
      // ドキュメントの基本情報を取得
      const docs = google.docs({ version: "v1", auth: this.auth });
      const response = await docs.documents.get({
        documentId,
        fields: "documentId,title,revisionId"
      });
      
      const documentInfo = response.data;
      
      // 結果オブジェクトを作成
      const result: DocumentInfo = {
        documentId,
        title: documentInfo.title || "",
        revisionId: documentInfo.revisionId || "",
        tabCount: tabs.length,
        tabs: []
      };
      
      // タブが存在しない場合は空の結果を返す
      if (tabs.length === 0) {
        result.tabs = [{
          tabId: "default",
          title: "メインドキュメント",
          level: 0,
          hasChildTabs: false,
          isDefaultTab: true
        }];
        return result;
      }
      
      // 各タブのテキスト内容を取得
      for (const tab of tabs) {
        try {
          const tabText = await this.getDocumentTabText(documentId, tab.tabId);
          
          result.tabs.push({
            tabId: tab.tabId,
            title: tab.title,
            level: tab.level,
            hasChildTabs: tab.hasChildTabs,
            isDefaultTab: tab.isDefaultTab,
            text: tabText
          });
        } catch (error) {
          console.error(`タブ "${tab.title}" (ID: ${tab.tabId}) のテキスト取得エラー:`, error);
          
          // エラーが発生したタブも結果に含めるが、エラーメッセージを設定
          result.tabs.push({
            tabId: tab.tabId,
            title: tab.title,
            level: tab.level,
            hasChildTabs: tab.hasChildTabs,
            isDefaultTab: tab.isDefaultTab,
            text: `エラー: このタブのテキスト取得に失敗しました (${error instanceof Error ? error.message : String(error)})`
          });
        }
      }
      
      return result;
    } catch (error) {
      console.error("Googleドキュメントの内容取得エラー:", error);
      throw error;
    }
  }

  // Googleドキュメントにテキストを挿入する関数
  async insertTextToDoc(
    documentId: string,
    location: number,
    text: string,
    tabId?: string
  ): Promise<any> {
    const docs = google.docs({ version: "v1", auth: this.auth });
    try {
      // 挿入位置を検証
      const validation = await this.validateInsertPosition(documentId, location, tabId);
      
      if (!validation.isValid) {
        throw new Error(validation.errorMessage || "無効な挿入位置です");
      }

      // location が -1 の場合は末尾に挿入
      let actualLocation = location;
      if (location === -1) {
        actualLocation = validation.maxIndex;
      }

      // 挿入リクエストの場所オブジェクトを構築
      const insertLocation: { index: number; tabId?: string } = {
        index: actualLocation
      };

      if (tabId) {
        try {
          const tabs = await this.getDocumentTabs(documentId);
          const targetTab = tabs.find(tab => tab.tabId === tabId);
          
          if (targetTab) {
            // タブが存在する場合は、APIにtabIdを直接指定
            insertLocation.tabId = tabId;
          } else {
            // 指定されたタブIDが見つからない場合はエラーを返す
            const availableTabIds = tabs.map(tab => `ID: ${tab.tabId} (タイトル: ${tab.title})`);
            throw new Error(
              `指定されたタブID "${tabId}" が見つかりません。\n利用可能なタブID一覧:\n${availableTabIds.join('\n')}`
            );
          }
        } catch (error) {
          // タブID確認エラーまたは見つからない場合はエラーを再スロー
          throw error;
        }
      }

      // Google Docs APIのリクエスト構築
      const insertTextRequest: any = {
        insertText: {
          location: {
            index: actualLocation
          },
          text,
        },
      };

      // タブIDが指定されている場合は、location内に含める
      if (tabId && insertLocation.tabId) {
        insertTextRequest.insertText.location.tabId = insertLocation.tabId;
      }

      const response = await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [insertTextRequest],
        },
      });
      
      return {
        ...response.data,
        targetTabId: insertLocation.tabId || 'first_tab',
        originalLocation: location,
        actualLocation: actualLocation,
        requestedTabId: tabId,
        validationInfo: {
          maxIndex: validation.maxIndex,
          tabTitle: validation.tabTitle
        }
      };
    } catch (error) {
      console.error("Googleドキュメントへのテキスト挿入エラー:", error);
      throw error;
    }
  }

  // Googleドキュメントにテキストと表を挿入する関数（マークダウン表対応）
  async insertContentToDoc(
    documentId: string,
    location: number,
    text: string,
    tabId?: string
  ): Promise<any> {
    const docs = google.docs({ version: "v1", auth: this.auth });

    try {
      // マークダウン表を含まない場合は従来のテキスト挿入
      if (!containsMarkdownTable(text)) {
        return await this.insertTextToDoc(documentId, location, text, tabId);
      }

      // マークダウンコンテンツをパース
      const segments = parseMarkdownContent(text);

      // 挿入位置を検証
      const validation = await this.validateInsertPosition(documentId, location, tabId);
      if (!validation.isValid) {
        throw new Error(validation.errorMessage || "無効な挿入位置です");
      }

      let actualLocation = location === -1 ? validation.maxIndex : location;
      let tablesInserted = 0;

      // セグメントを逆順で処理（Google Docs APIでは後ろから挿入することで位置ずれを防ぐ）
      const reversedSegments = [...segments].reverse();

      for (const segment of reversedSegments) {
        if (segment.type === 'text') {
          // テキストセグメントの挿入
          await this.insertTextSegment(docs, documentId, actualLocation, segment.content, tabId);
        } else if (segment.type === 'table') {
          // 表セグメントの挿入
          await this.insertTableSegment(docs, documentId, actualLocation, segment, tabId);
          tablesInserted++;
        }
      }

      return {
        documentId,
        targetTabId: tabId || 'first_tab',
        originalLocation: location,
        actualLocation: actualLocation,
        requestedTabId: tabId,
        segmentsInserted: segments.length,
        tablesInserted: tablesInserted,
        validationInfo: {
          maxIndex: validation.maxIndex,
          tabTitle: validation.tabTitle
        }
      };
    } catch (error) {
      console.error("Googleドキュメントへのコンテンツ挿入エラー:", error);
      throw error;
    }
  }

  // テキストセグメントを挿入するヘルパーメソッド
  private async insertTextSegment(
    docs: any,
    documentId: string,
    index: number,
    text: string,
    tabId?: string
  ): Promise<void> {
    const request: any = {
      insertText: {
        location: { index: index },
        text: text + '\n'  // 改行を追加して次のセグメントと分離
      }
    };

    if (tabId) {
      request.insertText.location.tabId = tabId;
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [request]
      }
    });
  }

  // 表セグメントを挿入するヘルパーメソッド
  private async insertTableSegment(
    docs: any,
    documentId: string,
    index: number,
    table: TableSegment,
    tabId?: string
  ): Promise<void> {
    // Step 1: 空の表を挿入
    const insertTableRequest: any = {
      insertTable: {
        rows: table.rows,
        columns: table.columns,
        location: { index: index }
      }
    };

    if (tabId) {
      insertTableRequest.insertTable.location.tabId = tabId;
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [insertTableRequest]
      }
    });

    // Step 2: 表構造を取得してセルインデックスを計算
    const docResponse = await docs.documents.get({
      documentId,
      includeTabsContent: true
    });

    // 挿入位置以降の表を探す
    const cellIndices = this.findTableCellIndices(docResponse.data, index, table.rows, table.columns, tabId);

    if (cellIndices.length === 0) {
      console.warn("表のセルインデックスを取得できませんでした");
      return;
    }

    // Step 3: セルにテキストを挿入（逆順で処理）
    const cellTextRequests: any[] = [];

    for (let r = table.rows - 1; r >= 0; r--) {
      for (let c = table.columns - 1; c >= 0; c--) {
        const cellContent = table.cells[r][c];
        if (cellContent) {
          const cellIndex = cellIndices[r]?.[c];
          if (cellIndex !== undefined) {
            const request: any = {
              insertText: {
                location: { index: cellIndex },
                text: cellContent
              }
            };

            if (tabId) {
              request.insertText.location.tabId = tabId;
            }

            cellTextRequests.push(request);
          }
        }
      }
    }

    if (cellTextRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: cellTextRequests
        }
      });
    }
  }

  // ドキュメント構造から表のセルインデックスを取得するヘルパーメソッド
  private findTableCellIndices(
    document: any,
    insertedIndex: number,
    rows: number,
    columns: number,
    tabId?: string
  ): number[][] {
    const cellIndices: number[][] = [];

    // タブを取得（タブIDが指定されている場合はそのタブ、なければ最初のタブ）
    let bodyContent: any[] = [];

    if (document.tabs && document.tabs.length > 0) {
      if (tabId) {
        // 指定されたタブを検索
        const findTab = (tabs: any[]): any => {
          for (const tab of tabs) {
            if (tab.tabProperties?.tabId === tabId) {
              return tab;
            }
            if (tab.childTabs) {
              const found = findTab(tab.childTabs);
              if (found) return found;
            }
          }
          return null;
        };
        const targetTab = findTab(document.tabs);
        if (targetTab?.documentTab?.body?.content) {
          bodyContent = targetTab.documentTab.body.content;
        }
      } else {
        // 最初のタブを使用
        const firstTab = document.tabs[0];
        if (firstTab?.documentTab?.body?.content) {
          bodyContent = firstTab.documentTab.body.content;
        }
      }
    } else if (document.body?.content) {
      bodyContent = document.body.content;
    }

    // 挿入位置以降で最初の表を検索
    for (const element of bodyContent) {
      if (element.table && element.startIndex >= insertedIndex) {
        const table = element.table;

        if (table.tableRows) {
          for (let r = 0; r < Math.min(table.tableRows.length, rows); r++) {
            cellIndices[r] = [];
            const row = table.tableRows[r];

            if (row.tableCells) {
              for (let c = 0; c < Math.min(row.tableCells.length, columns); c++) {
                const cell = row.tableCells[c];
                // セルの最初のコンテンツの開始インデックスを取得
                if (cell.content && cell.content[0]?.startIndex !== undefined) {
                  cellIndices[r][c] = cell.content[0].startIndex;
                }
              }
            }
          }
        }
        break;  // 最初の表のみ処理
      }
    }

    return cellIndices;
  }

  // Googleドキュメントのタブ一覧を取得する関数
  async getDocumentTabs(documentId: string): Promise<TabInfo[]> {
    try {
      const docs = google.docs({ version: "v1", auth: this.auth });
      
      // includeTabsContentをtrueに設定してドキュメントを取得
      const response = await docs.documents.get({
        documentId,
        includeTabsContent: true
      });
      
      const document = response.data;
      
      // タブが存在しない場合
      if (!document.tabs || document.tabs.length === 0) {
        return [];
      }
      
      // タブ情報を再帰的に抽出する関数
      function extractTabInfo(tabs: any[], level: number = 0): TabInfo[] {
        const tabList: TabInfo[] = [];
        
        for (const tab of tabs) {
          if (tab.tabProperties) {
            const tabInfo: TabInfo = {
              tabId: tab.tabProperties.tabId || "",
              title: tab.tabProperties.title || "無題のタブ",
              level: level,
              hasChildTabs: tab.childTabs && tab.childTabs.length > 0,
              isDefaultTab: level === 0 && tabList.length === 0 // 最初のルートレベルタブをデフォルトとして扱う
            };
            
            tabList.push(tabInfo);
            
            // 子タブが存在する場合は再帰的に処理
            if (tab.childTabs && tab.childTabs.length > 0) {
              const childTabs = extractTabInfo(tab.childTabs, level + 1);
              tabList.push(...childTabs);
            }
          }
        }
        
        return tabList;
      }
      
      // タブ情報を抽出
      const tabList = extractTabInfo(document.tabs);
      
      return tabList;
    } catch (error) {
      console.error("ドキュメントタブ一覧取得エラー:", error);
      throw error;
    }
  }

  // Googleドキュメントのタブ指定でテキストを取得する関数
  async getDocumentTabText(documentId: string, tabId: string): Promise<string> {
    try {
      const docs = google.docs({ version: "v1", auth: this.auth });
      
      // includeTabsContentをtrueに設定してドキュメントを取得
      const response = await docs.documents.get({
        documentId,
        includeTabsContent: true
      });
      
      const document = response.data;
      
      // テキスト抽出結果
      let extractedText = "";
      
      // タイトルを追加
      if (document.title) {
        extractedText += `タイトル: ${document.title}\n\n`;
      }
      
      // タブが存在しない場合
      if (!document.tabs || document.tabs.length === 0) {
        return extractedText + "ドキュメントにタブが存在しません。";
      }
      
      // 指定されたタブIDを検索する関数
      function findTabById(tabs: any[], targetTabId: string): any {
        for (const tab of tabs) {
          if (tab.tabProperties && tab.tabProperties.tabId === targetTabId) {
            return tab;
          }
          // 子タブも検索
          if (tab.childTabs && tab.childTabs.length > 0) {
            const foundTab = findTabById(tab.childTabs, targetTabId);
            if (foundTab) return foundTab;
          }
        }
        return null;
      }
      
      // 指定されたタブIDを検索
      const targetTab = findTabById(document.tabs, tabId);
      
      if (!targetTab) {
        // 利用可能なタブIDを一覧表示
        const availableTabIds: string[] = [];
        
        function collectTabIds(tabs: any[]) {
          for (const tab of tabs) {
            if (tab.tabProperties && tab.tabProperties.tabId) {
              const title = tab.tabProperties.title || "無題のタブ";
              availableTabIds.push(`ID: ${tab.tabProperties.tabId} (タイトル: ${title})`);
            }
            if (tab.childTabs && tab.childTabs.length > 0) {
              collectTabIds(tab.childTabs);
            }
          }
        }
        
        collectTabIds(document.tabs);
        
        return extractedText + 
          `指定されたタブID "${tabId}" が見つかりません。\n\n` +
          `利用可能なタブID一覧:\n${availableTabIds.join('\n')}`;
      }
      
      // タブ情報を追加
      if (targetTab.tabProperties) {
        const tabTitle = targetTab.tabProperties.title || "無題のタブ";
        extractedText += `タブ: ${tabTitle} (ID: ${tabId})\n\n`;
      }
      
      // DocumentTabオブジェクトからコンテンツを取得
      const documentTab = targetTab.documentTab;
      
      if (!documentTab || !documentTab.body || !documentTab.body.content) {
        return extractedText + "指定されたタブの内容が存在しません。";
      }
      
      // タブ内の各要素からテキストを抽出
      for (const element of documentTab.body.content) {
        // 段落要素の場合
        if (element.paragraph) {
          const paragraph = element.paragraph;
          
          // 段落スタイルの情報を確認
          const paragraphStyle = paragraph.paragraphStyle || {};
          const namedStyleType = paragraphStyle.namedStyleType || "";
          
          // 見出しスタイルの場合は特別な表示を追加
          if (namedStyleType.includes("HEADING")) {
            extractedText += "\n"; // 見出し前に空行を追加
          }
          
          // 段落内の各要素（テキスト実行など）からテキストを抽出
          let paragraphText = "";
          if (paragraph.elements) {
            for (const textElement of paragraph.elements) {
              if (textElement.textRun && textElement.textRun.content) {
                paragraphText += textElement.textRun.content;
              }
            }
          }
          
          // 段落テキストを追加
          extractedText += paragraphText;
          
          // 見出しスタイルの場合は特別な表示を追加
          if (namedStyleType.includes("HEADING")) {
            extractedText += "\n"; // 見出し後に空行を追加
          }
        }
        
        // テーブル要素の場合
        else if (element.table) {
          const table = element.table;
          extractedText += "\n"; // テーブル前に空行を追加
          
          // テーブルの行ごとに処理
          if (table.tableRows) {
            for (const row of table.tableRows) {
              let rowText = "";
              
              // 行内のセルごとに処理
              if (row.tableCells) {
                for (const cell of row.tableCells) {
                  let cellText = "";
                  
                  // セル内のコンテンツを処理
                  if (cell.content) {
                    for (const content of cell.content) {
                      if (content.paragraph && content.paragraph.elements) {
                        for (const textElement of content.paragraph.elements) {
                          if (textElement.textRun && textElement.textRun.content) {
                            cellText += textElement.textRun.content.trim();
                          }
                        }
                      }
                    }
                  }
                  
                  // セルテキストをパイプ区切りで追加
                  rowText += (rowText ? " | " : "") + cellText;
                }
              }
              
              // 行テキストを追加
              if (rowText) {
                extractedText += rowText + "\n";
              }
            }
          }
          
          extractedText += "\n"; // テーブル後に空行を追加
        }
        
        // リスト要素の場合
        else if (element.paragraph && element.paragraph.bullet) {
          const paragraph = element.paragraph;
          const bullet = paragraph.bullet;
          
          // リストアイテムのテキストを抽出
          let listItemText = "";
          if (paragraph.elements) {
            for (const textElement of paragraph.elements) {
              if (textElement.textRun && textElement.textRun.content) {
                listItemText += textElement.textRun.content;
              }
            }
          }
          
          // ネストレベルに応じたインデントを追加
          const nestingLevel = bullet.nestingLevel || 0;
          const indent = "  ".repeat(nestingLevel);
          
          // 箇条書きスタイルを適用
          extractedText += `${indent}• ${listItemText}`;
        }
      }
      
      // 余分な改行を整理
      extractedText = extractedText.replace(/\n\n\n+/g, "\n\n");
      
      return extractedText;
    } catch (error) {
      console.error("ドキュメントタブテキスト抽出エラー:", error);
      throw error;
    }
  }

  // 指定されたタブまたはドキュメント全体の文字数を取得する関数
  async getDocumentTabContentLength(documentId: string, tabId?: string): Promise<{ length: number; tabTitle?: string }> {
    try {
      const docs = google.docs({ version: "v1", auth: this.auth });
      
      // includeTabsContentをtrueに設定してドキュメントを取得
      const response = await docs.documents.get({
        documentId,
        includeTabsContent: true
      });
      
      const document = response.data;
      
      if (tabId) {
        // 指定されたタブIDを検索する関数
        function findTabById(tabs: any[], targetTabId: string): any {
          for (const tab of tabs) {
            if (tab.tabProperties && tab.tabProperties.tabId === targetTabId) {
              return tab;
            }
            // 子タブも検索
            if (tab.childTabs && tab.childTabs.length > 0) {
              const foundTab = findTabById(tab.childTabs, targetTabId);
              if (foundTab) return foundTab;
            }
          }
          return null;
        }
        
        // タブが存在しない場合
        if (!document.tabs || document.tabs.length === 0) {
          throw new Error("ドキュメントにタブが存在しません");
        }
        
        // 指定されたタブIDを検索
        const targetTab = findTabById(document.tabs, tabId);
        
        if (!targetTab) {
          throw new Error(`指定されたタブID "${tabId}" が見つかりません`);
        }
        
        // DocumentTabオブジェクトからコンテンツの長さを計算
        const documentTab = targetTab.documentTab;
        
        if (!documentTab || !documentTab.body || !documentTab.body.content) {
          return {
            length: 0,
            tabTitle: targetTab.tabProperties?.title || "無題のタブ"
          };
        }
        
        // タブ内のコンテンツの文字数を計算
        let totalLength = 0;
        for (const element of documentTab.body.content) {
          if (element.endIndex !== undefined) {
            totalLength = Math.max(totalLength, element.endIndex);
          }
        }
        
        return {
          length: totalLength - 1, // endIndexは1ベースなので調整
          tabTitle: targetTab.tabProperties?.title || "無題のタブ"
        };
      } else {
        // ドキュメント全体の文字数を取得
        if (!document.body || !document.body.content) {
          return { length: 0 };
        }
        
        let totalLength = 0;
        for (const element of document.body.content) {
          if (element.endIndex !== undefined) {
            totalLength = Math.max(totalLength, element.endIndex);
          }
        }
        
        return { length: totalLength - 1 }; // endIndexは1ベースなので調整
      }
    } catch (error) {
      console.error("ドキュメント文字数取得エラー:", error);
      throw error;
    }
  }

  // 挿入位置を検証する関数
  async validateInsertPosition(documentId: string, location: number, tabId?: string): Promise<{ 
    isValid: boolean; 
    maxIndex: number; 
    errorMessage?: string; 
    tabTitle?: string 
  }> {
    try {
      // location が -1 の場合は末尾挿入として有効
      if (location === -1) {
        const lengthInfo = await this.getDocumentTabContentLength(documentId, tabId);
        return {
          isValid: true,
          maxIndex: lengthInfo.length,
          tabTitle: lengthInfo.tabTitle
        };
      }
      
      const lengthInfo = await this.getDocumentTabContentLength(documentId, tabId);
      const maxIndex = lengthInfo.length;
      
      if (location < 0 || location > maxIndex) {
        const tabInfo = tabId ? ` (タブ: ${lengthInfo.tabTitle})` : "";
        return {
          isValid: false,
          maxIndex,
          errorMessage: `挿入位置 ${location} は無効です${tabInfo}。有効な位置は 0 ～ ${maxIndex} です。現在の文字数: ${maxIndex}`,
          tabTitle: lengthInfo.tabTitle
        };
      }
      
      return {
        isValid: true,
        maxIndex,
        tabTitle: lengthInfo.tabTitle
      };
    } catch (error) {
      return {
        isValid: false,
        maxIndex: 0,
        errorMessage: `位置検証エラー: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Googleドキュメントに新しいタブを作成する関数（API制限により未対応）
  async createNewTab(documentId: string, title: string): Promise<any> {
    return {
      status: 'error',
      message: `Google Docs APIの制限により、ドキュメントに新しいタブを作成することはできません`,
      documentId: documentId,
      tabTitle: title,
      error: "API_LIMITATION",
      note: "Google Docs APIでは現在、独立したタブの作成がサポートされていません。代替案として、手動でセクション見出しを追加することをご検討ください。",
      supportedOperations: [
        "テキストの挿入・編集",
        "フォーマットの変更", 
        "グラフの追加",
        "既存タブの読み取り"
      ]
    };
  }

  // Googleドキュメントにグラフを作成する関数
  async createChartInDoc(
    documentId: string,
    chartType: 'COLUMN' | 'LINE' | 'PIE' | 'BAR' | 'SCATTER',
    sourceSheetId: string,
    sourceRange: string,
    title?: string,
    insertIndex?: number
  ): Promise<any> {
    const docs = google.docs({ version: "v1", auth: this.auth });
    try {
      // Google Charts APIで使用するチャートタイプを変換
      let googleChartType: string;
      switch (chartType) {
        case 'PIE':
          googleChartType = 'pie';
          break;
        case 'COLUMN':
          googleChartType = 'column';
          break;
        case 'LINE':
          googleChartType = 'line';
          break;
        case 'BAR':
          googleChartType = 'bar';
          break;
        case 'SCATTER':
          googleChartType = 'scatter';
          break;
      }

      // スプレッドシートからグラフを作成してドキュメントに挿入
      const response = await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            {
              insertInlineImage: {
                location: {
                  index: insertIndex || 1,
                },
                uri: `https://docs.google.com/spreadsheets/d/${sourceSheetId}/gviz/tq?tqx=out:png&tq=SELECT%20*%20FROM%20${sourceRange}&cht=${googleChartType}`,
                objectSize: {
                  height: {
                    magnitude: 300,
                    unit: "PT"
                  },
                  width: {
                    magnitude: 400,
                    unit: "PT"
                  }
                }
              }
            }
          ]
        }
      });

      return {
        status: 'success',
        documentId,
        chartType,
        sourceSheetId,
        sourceRange,
        title,
        insertIndex,
        response: response.data
      };
    } catch (error) {
      console.error("Googleドキュメントへのグラフ作成エラー:", error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'グラフ作成に失敗しました',
        documentId,
        chartType,
        sourceSheetId,
        sourceRange
      };
    }
  }

  // ドキュメントの部分をコピーする関数（未実装）
  async copyPart(
    documentId: string,
    sourcePartId: string,
    newPartName?: string
  ): Promise<any> {
    return {
      status: 'error',
      message: 'ドキュメントの部分コピー機能は未実装です',
      documentId: documentId,
      sourcePartId: sourcePartId,
      newPartName: newPartName,
      error: 'NOT_IMPLEMENTED',
      note: 'この機能は現在実装されていません。スプレッドシートのシートコピーのみ対応しています。',
      supportedOperations: [
        'テキストの挿入・編集',
        'フォーマットの変更',
        'グラフの追加',
        '既存タブの読み取り'
      ]
    };
  }
} 