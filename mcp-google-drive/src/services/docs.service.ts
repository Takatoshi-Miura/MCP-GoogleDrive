import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { TabInfo, DocumentInfo } from "../types/index.js";

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
      // 挿入リクエストの場所オブジェクトを構築
      const insertLocation: { index: number; tabId?: string } = {
        index: location
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
            index: location
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
        requestedTabId: tabId
      };
    } catch (error) {
      console.error("Googleドキュメントへのテキスト挿入エラー:", error);
      throw error;
    }
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
} 