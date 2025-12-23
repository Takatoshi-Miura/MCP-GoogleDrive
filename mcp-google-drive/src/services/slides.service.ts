import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { parseMarkdownContent, containsMarkdownTable, TableSegment } from "../utils/markdown-table-parser.js";

export class SlidesService {
  constructor(private auth: OAuth2Client) {}

  // Googleスライドのコメントを取得する関数
  async getPresentationComments(presentationId: string) {
    try {
      const drive = google.drive({ version: 'v3', auth: this.auth });

      // Drive APIを使用してプレゼンテーションのコメントを取得
      const commentsResponse = await drive.comments.list({
        fileId: presentationId,
        fields: 'comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent,replies)',
      });

      const allComments = commentsResponse.data.comments || [];

      // コメントを整理
      const comments = allComments.map(comment => ({
        id: comment.id,
        content: comment.content,
        author: {
          displayName: comment.author?.displayName || '不明',
          emailAddress: comment.author?.emailAddress || '',
          photoLink: comment.author?.photoLink || '',
        },
        createdTime: comment.createdTime,
        modifiedTime: comment.modifiedTime,
        resolved: comment.resolved || false,
        quotedFileContent: comment.quotedFileContent || null,
        replies: comment.replies?.map(reply => ({
          id: reply.id,
          content: reply.content,
          author: {
            displayName: reply.author?.displayName || '不明',
            emailAddress: reply.author?.emailAddress || '',
            photoLink: reply.author?.photoLink || '',
          },
          createdTime: reply.createdTime,
          modifiedTime: reply.modifiedTime,
        })) || [],
      }));

      console.log(`プレゼンテーション ${presentationId} のコメントを ${comments.length} 件取得しました`);
      
      return {
        presentationId,
        totalComments: comments.length,
        resolvedComments: comments.filter(c => c.resolved).length,
        unresolvedComments: comments.filter(c => !c.resolved).length,
        comments,
      };

    } catch (error) {
      console.error('プレゼンテーションコメント取得エラー:', error);
      throw error;
    }
  }

  // Google スライドのテキストを取得する関数
  async getPresentationText(presentationId: string): Promise<string> {
    const slides = google.slides({ version: "v1", auth: this.auth });
    try {
      const presentation = await slides.presentations.get({
        presentationId,
      });

      let extractedText = "";
      
      // プレゼンテーションタイトルを追加
      if (presentation.data.title) {
        extractedText += `プレゼンテーションタイトル: ${presentation.data.title}\n\n`;
      }

      if (presentation.data.slides) {
        for (const [index, slide] of presentation.data.slides.entries()) {
          extractedText += `スライド ${index + 1}:\n`;
          
          if (slide.pageElements) {
            for (const element of slide.pageElements) {
              if (element.shape && element.shape.text) {
                const textElements = element.shape.text.textElements;
                if (textElements) {
                  for (const textElement of textElements) {
                    if (textElement.textRun && textElement.textRun.content) {
                      extractedText += textElement.textRun.content;
                    }
                  }
                }
              }
            }
          }
          
          extractedText += "\n\n";
        }
      }

      return extractedText;
    } catch (error) {
      console.error("Google スライドテキスト取得エラー:", error);
      throw error;
    }
  }

  // Google スライドの特定のページを取得する関数
  async getSlideByPageNumber(presentationId: string, pageNumber: number): Promise<any> {
    const slides = google.slides({ version: "v1", auth: this.auth });
    try {
      const presentation = await slides.presentations.get({
        presentationId,
      });

      if (!presentation.data.slides) {
        throw new Error("スライドが見つかりません");
      }

      // ページ番号の範囲チェック（1ベース）
      if (pageNumber < 1 || pageNumber > presentation.data.slides.length) {
        throw new Error(`ページ番号 ${pageNumber} は範囲外です。利用可能なページ: 1-${presentation.data.slides.length}`);
      }

      // 0ベースのインデックスに変換
      const slideIndex = pageNumber - 1;
      const slide = presentation.data.slides[slideIndex];

      let slideInfo = {
        pageNumber: pageNumber,
        slideId: slide.objectId,
        title: "",
        text: "",
        elements: []
      };

      // スライドの要素を処理
      if (slide.pageElements) {
        for (const element of slide.pageElements) {
          if (element.shape && element.shape.text) {
            const textElements = element.shape.text.textElements;
            if (textElements) {
              let elementText = "";
              for (const textElement of textElements) {
                if (textElement.textRun && textElement.textRun.content) {
                  elementText += textElement.textRun.content;
                }
              }
              
              // タイトルは通常最初のテキスト要素
              if (!slideInfo.title && elementText.trim()) {
                slideInfo.title = elementText.trim();
              }
              
              slideInfo.text += elementText;
              slideInfo.elements.push({
                type: "text",
                content: elementText
              });
            }
          }
        }
      }

      return slideInfo;
    } catch (error) {
      console.error("Google スライドページ取得エラー:", error);
      throw error;
    }
  }

  // Google スライドに新しいスライドを作成する関数
  async createNewSlide(presentationId: string, title?: string): Promise<any> {
    const slides = google.slides({ version: "v1", auth: this.auth });
    try {
      const slideObjectId = `slide_${Date.now()}`;
      const titleObjectId = `title_${Date.now()}`;
      
      const requests: any[] = [
        {
          createSlide: {
            objectId: slideObjectId,
            slideLayoutReference: {
              predefinedLayout: "TITLE_AND_BODY"
            },
            placeholderIdMappings: [
              {
                layoutPlaceholder: {
                  type: "TITLE"
                },
                objectId: titleObjectId
              }
            ]
          }
        }
      ];

      // タイトルが指定されている場合はテキストを挿入
      if (title) {
        requests.push({
          insertText: {
            objectId: titleObjectId,
            text: title
          }
        });
      }

      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: requests
        }
      });

      return {
        status: 'success',
        message: `新しいスライド${title ? ` "${title}"` : ''} を作成しました`,
        presentationId: presentationId,
        slideTitle: title || "新しいスライド",
        slideObjectId: slideObjectId,
        response: response.data
      };
    } catch (error) {
      console.error("Google スライド作成エラー:", error);
      throw error;
    }
  }

  // Google スライドにグラフを作成する関数
  async createChartInSlide(
    presentationId: string,
    slideIndex: number,
    chartType: 'COLUMN' | 'LINE' | 'PIE' | 'BAR' | 'SCATTER',
    sourceSheetId: string,
    sourceRange: string,
    title?: string,
    bounds?: { x: number; y: number; width: number; height: number },
    existingChartId?: number
  ): Promise<any> {
    const slides = google.slides({ version: "v1", auth: this.auth });
    const sheets = google.sheets({ version: "v4", auth: this.auth });
    
    try {
      // プレゼンテーションの情報を取得してスライドIDを取得
      const presentation = await slides.presentations.get({
        presentationId,
      });

      if (!presentation.data.slides || slideIndex >= presentation.data.slides.length) {
        throw new Error(`スライドインデックス ${slideIndex} は範囲外です`);
      }

      const slideId = presentation.data.slides[slideIndex].objectId;
      const chartObjectId = `chart_${Date.now()}`;

      // デフォルトの位置とサイズ
      const defaultBounds = {
        x: bounds?.x || 100,
        y: bounds?.y || 100,
        width: bounds?.width || 400,
        height: bounds?.height || 300
      };

      let chartId = existingChartId;

      // 既存のチャートIDが指定されていない場合、スプレッドシートに新しいチャートを作成
      if (!chartId) {
        console.log('スプレッドシートに新しいチャートを作成中...');
        
        // スプレッドシートの情報を取得
        const spreadsheet = await sheets.spreadsheets.get({
          spreadsheetId: sourceSheetId,
        });

        const sheetId = spreadsheet.data.sheets?.[0]?.properties?.sheetId || 0;

        // スプレッドシートにチャートを作成
        const chartResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sourceSheetId,
          requestBody: {
            requests: [
              {
                addChart: {
                  chart: {
                    spec: chartType === 'PIE' ? {
                      title: title || '円グラフ',
                      pieChart: {
                        legendPosition: 'BOTTOM_LEGEND',
                        domain: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: sheetId,
                                startRowIndex: 0,
                                endRowIndex: 150,
                                startColumnIndex: 0,
                                endColumnIndex: 1
                              }
                            ]
                          }
                        },
                        series: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: sheetId,
                                startRowIndex: 0,
                                endRowIndex: 150,
                                startColumnIndex: 1,
                                endColumnIndex: 2
                              }
                            ]
                          }
                        },
                        threeDimensional: false
                      }
                    } : {
                      title: title || 'グラフ',
                      basicChart: {
                        chartType: chartType,
                        legendPosition: 'BOTTOM_LEGEND',
                        axis: [
                          {
                            position: 'BOTTOM_AXIS',
                            title: 'X軸',
                          },
                          {
                            position: 'LEFT_AXIS',
                            title: 'Y軸',
                          }
                        ],
                        domains: [
                          {
                            domain: {
                              sourceRange: {
                                sources: [
                                  {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 150,
                                    startColumnIndex: 0,
                                    endColumnIndex: 1
                                  }
                                ]
                              }
                            }
                          }
                        ],
                        series: [
                          {
                            series: {
                              sourceRange: {
                                sources: [
                                  {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 150,
                                    startColumnIndex: 1,
                                    endColumnIndex: 2
                                  }
                                ]
                              }
                            },
                            targetAxis: 'LEFT_AXIS'
                          }
                        ]
                      }
                    },
                    position: {
                      overlayPosition: {
                        anchorCell: {
                          sheetId: sheetId,
                          rowIndex: 5,
                          columnIndex: 4
                        },
                        widthPixels: 600,
                        heightPixels: 371
                      }
                    }
                  }
                }
              }
            ]
          }
        });

        // 作成されたチャートのIDを取得
        const addChartReply = chartResponse.data.replies?.[0]?.addChart;
        if (addChartReply?.chart?.chartId) {
          chartId = addChartReply.chart.chartId;
          console.log(`新しいチャートが作成されました。チャートID: ${chartId}`);
        } else {
          throw new Error('スプレッドシートでのチャート作成に失敗しました');
        }
      }

      // スライドにチャートを追加
      console.log(`スライドにチャートを追加中... チャートID: ${chartId}`);
      
      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: [
            {
              createSheetsChart: {
                objectId: chartObjectId,
                spreadsheetId: sourceSheetId,
                chartId: chartId,
                linkingMode: "LINKED",
                elementProperties: {
                  pageObjectId: slideId,
                  size: {
                    width: {
                      magnitude: defaultBounds.width,
                      unit: "PT"
                    },
                    height: {
                      magnitude: defaultBounds.height,
                      unit: "PT"
                    }
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: defaultBounds.x,
                    translateY: defaultBounds.y,
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
        presentationId,
        slideIndex,
        slideId,
        chartObjectId,
        chartId,
        chartType,
        sourceSheetId,
        sourceRange,
        title,
        bounds: defaultBounds,
        response: response.data
      };
    } catch (error) {
      console.error("Google スライドへのグラフ作成エラー:", error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'グラフ作成に失敗しました',
        presentationId,
        slideIndex,
        chartType,
        sourceSheetId,
        sourceRange,
        details: error
      };
    }
  }

  // 既存のスプレッドシートチャートをスライドにリンクする関数
  async linkExistingChartToSlide(
    presentationId: string,
    slideIndex: number,
    sourceSheetId: string,
    chartId: number,
    bounds?: { x: number; y: number; width: number; height: number }
  ): Promise<any> {
    const slides = google.slides({ version: "v1", auth: this.auth });
    
    try {
      // プレゼンテーションの情報を取得してスライドIDを取得
      const presentation = await slides.presentations.get({
        presentationId,
      });

      if (!presentation.data.slides || slideIndex >= presentation.data.slides.length) {
        throw new Error(`スライドインデックス ${slideIndex} は範囲外です`);
      }

      const slideId = presentation.data.slides[slideIndex].objectId;
      const chartObjectId = `linked_chart_${Date.now()}`;

      // デフォルトの位置とサイズ
      const defaultBounds = {
        x: bounds?.x || 100,
        y: bounds?.y || 100,
        width: bounds?.width || 400,
        height: bounds?.height || 300
      };

      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: [
            {
              createSheetsChart: {
                objectId: chartObjectId,
                spreadsheetId: sourceSheetId,
                chartId: chartId,
                linkingMode: "LINKED",
                elementProperties: {
                  pageObjectId: slideId,
                  size: {
                    width: {
                      magnitude: defaultBounds.width,
                      unit: "PT"
                    },
                    height: {
                      magnitude: defaultBounds.height,
                      unit: "PT"
                    }
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: defaultBounds.x,
                    translateY: defaultBounds.y,
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
        presentationId,
        slideIndex,
        slideId,
        chartObjectId,
        chartId,
        sourceSheetId,
        bounds: defaultBounds,
        response: response.data
      };
    } catch (error) {
      console.error("既存チャートのリンクエラー:", error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : '既存チャートのリンクに失敗しました',
        presentationId,
        slideIndex,
        sourceSheetId,
        chartId,
        details: error
      };
    }
  }

  // スライドにシンプルなテキストを挿入する関数（マークダウン表非対応版）
  private async insertSimpleTextToSlide(
    presentationId: string,
    slideIndex: number,
    text: string,
    bounds?: { x?: number; y?: number; width?: number; height?: number }
  ): Promise<any> {
    const slides = google.slides({ version: "v1", auth: this.auth });
    
    try {
      // プレゼンテーションの情報を取得してスライドIDを取得
      const presentation = await slides.presentations.get({
        presentationId,
      });

      if (!presentation.data.slides || slideIndex >= presentation.data.slides.length) {
        throw new Error(`スライドインデックス ${slideIndex} は範囲外です`);
      }

      const slideId = presentation.data.slides[slideIndex].objectId;
      const textBoxObjectId = `textbox_${Date.now()}`;

      // デフォルトの位置とサイズ
      const defaultBounds = {
        x: bounds?.x || 100,
        y: bounds?.y || 100,
        width: bounds?.width || 400,
        height: bounds?.height || 100
      };

      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: [
            {
              createShape: {
                objectId: textBoxObjectId,
                shapeType: "TEXT_BOX",
                elementProperties: {
                  pageObjectId: slideId,
                  size: {
                    width: {
                      magnitude: defaultBounds.width,
                      unit: "PT"
                    },
                    height: {
                      magnitude: defaultBounds.height,
                      unit: "PT"
                    }
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: defaultBounds.x,
                    translateY: defaultBounds.y,
                    unit: "PT"
                  }
                }
              }
            },
            {
              insertText: {
                objectId: textBoxObjectId,
                text: text
              }
            }
          ]
        }
      });

      return {
        status: 'success',
        message: 'スライドにテキストを挿入しました',
        presentationId,
        slideIndex,
        slideId,
        textBoxObjectId,
        text,
        bounds: defaultBounds,
        response: response.data
      };
    } catch (error) {
      console.error("スライドへのテキスト挿入エラー:", error);
      throw error;
    }
  }

  // スライドにテキストを挿入する関数（マークダウン表対応）
  async insertTextToSlide(
    presentationId: string,
    slideIndex: number,
    text: string,
    bounds?: { x?: number; y?: number; width?: number; height?: number }
  ): Promise<any> {
    // マークダウン表が含まれているかチェック
    if (!containsMarkdownTable(text)) {
      // マークダウン表がない場合は従来の単純なテキスト挿入
      return await this.insertSimpleTextToSlide(presentationId, slideIndex, text, bounds);
    }

    // マークダウン表が含まれている場合はコンテンツ挿入
    return await this.insertContentToSlide(presentationId, slideIndex, text, bounds);
  }

  // スライドにコンテンツ（テキスト+マークダウン表）を挿入する関数
  private async insertContentToSlide(
    presentationId: string,
    slideIndex: number,
    text: string,
    bounds?: { x?: number; y?: number; width?: number; height?: number }
  ): Promise<any> {
    const slides = google.slides({ version: "v1", auth: this.auth });

    try {
      // マークダウンコンテンツをパース
      const segments = parseMarkdownContent(text);

      // プレゼンテーションの情報を取得してスライドIDを取得
      const presentation = await slides.presentations.get({
        presentationId,
      });

      if (!presentation.data.slides || slideIndex >= presentation.data.slides.length) {
        throw new Error(`スライドインデックス ${slideIndex} は範囲外です`);
      }

      const slideId = presentation.data.slides[slideIndex].objectId!;

      // 初期位置とデフォルト値を設定
      let currentY = bounds?.y || 100;
      const defaultX = bounds?.x || 100;
      const defaultWidth = bounds?.width || 400;

      let tablesInserted = 0;
      const allRequests: any[] = [];
      const createdTableIds: string[] = []; // 作成した表のIDを追跡

      // セグメントを順次処理（スライドでは前から順に配置）
      for (const segment of segments) {
        if (segment.type === 'text') {
          const textBoxHeight = bounds?.height || 100;
          const textBoxId = `textbox_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

          // テキストボックスを作成
          allRequests.push({
            createShape: {
              objectId: textBoxId,
              shapeType: "TEXT_BOX",
              elementProperties: {
                pageObjectId: slideId,
                size: {
                  width: { magnitude: defaultWidth, unit: "PT" },
                  height: { magnitude: textBoxHeight, unit: "PT" }
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: defaultX,
                  translateY: currentY,
                  unit: "PT"
                }
              }
            }
          });

          // テキストを挿入
          allRequests.push({
            insertText: {
              objectId: textBoxId,
              text: segment.content
            }
          });

          currentY += textBoxHeight + 20; // スペーシングを追加

        } else if (segment.type === 'table') {
          const tableId = `table_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

          // 表のサイズを計算
          const cellHeight = 40; // デフォルトのセル高さ
          const tableHeight = cellHeight * segment.rows;

          // 表を作成
          allRequests.push({
            createTable: {
              objectId: tableId,
              elementProperties: {
                pageObjectId: slideId,
                size: {
                  width: { magnitude: defaultWidth, unit: "PT" },
                  height: { magnitude: tableHeight, unit: "PT" }
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: defaultX,
                  translateY: currentY,
                  unit: "PT"
                }
              },
              rows: segment.rows,
              columns: segment.columns
            }
          });

          createdTableIds.push(tableId); // 作成した表のIDを保存
          tablesInserted++;
          currentY += tableHeight + 20; // スペーシングを追加
        }
      }

      // バッチ更新を実行（シェイプと表の作成）
      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests: allRequests }
      });

      // 表が挿入された場合、保存したIDを使用してセルテキストを挿入
      if (tablesInserted > 0) {
        // 表を見つけてセルテキストを挿入
        let tableIndex = 0;
        for (const segment of segments) {
          if (segment.type === 'table') {
            const tableObjectId = createdTableIds[tableIndex];
            const cellTextRequests = this.createCellTextRequestsById(
              tableObjectId,
              segment
            );

            if (cellTextRequests.length > 0) {
              await slides.presentations.batchUpdate({
                presentationId,
                requestBody: { requests: cellTextRequests }
              });
            }

            tableIndex++;
          }
        }
      }

      return {
        status: 'success',
        message: tablesInserted > 0
          ? `スライドにテキストと${tablesInserted}個の表を挿入しました`
          : 'スライドにテキストを挿入しました',
        presentationId,
        slideIndex,
        slideId,
        segmentsInserted: segments.length,
        tablesInserted
      };

    } catch (error) {
      console.error("スライドへのコンテンツ挿入エラー:", error);
      throw error;
    }
  }

  // スライドをコピーする関数
  async copySlide(
    presentationId: string,
    sourceSlideId: string,
    newSlideTitle?: string
  ): Promise<any> {
    const slides = google.slides({ version: "v1", auth: this.auth });
    
    try {
      // プレゼンテーション情報を取得してスライドの存在確認
      const presentation = await slides.presentations.get({
        presentationId
      });

      if (!presentation.data.slides) {
        throw new Error('プレゼンテーションにスライドが存在しません');
      }

      // 指定されたスライドIDを検索
      const sourceSlide = presentation.data.slides.find(slide => slide.objectId === sourceSlideId);
      if (!sourceSlide) {
        const availableSlides = presentation.data.slides.map((slide, index) => 
          `スライド${index + 1}: ${slide.objectId}`
        ).join(', ');
        throw new Error(`指定されたスライドID "${sourceSlideId}" が見つかりません。利用可能なスライド: ${availableSlides}`);
      }

      const duplicateSlideObjectId = `slide_copy_${Date.now()}`;
      
      // スライドを複製するリクエストを構築
      const requests: any[] = [
        {
          duplicateObject: {
            objectId: sourceSlideId,
            objectIds: {
              [sourceSlideId]: duplicateSlideObjectId
            }
          }
        }
      ];

      // バッチ更新を実行
      const response = await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
          requests: requests
        }
      });

      // 新しいタイトルが指定されている場合は、複製後のスライドのタイトル要素を更新
      if (newSlideTitle) {
        try {
          const updatedPresentation = await slides.presentations.get({
            presentationId
          });
          
          const duplicatedSlide = updatedPresentation.data.slides?.find(slide => slide.objectId === duplicateSlideObjectId);
          if (duplicatedSlide && duplicatedSlide.pageElements) {
            // タイトル要素を探す（プレースホルダーがTITLEのもの、または最初のテキスト要素）
            const titleElement = duplicatedSlide.pageElements.find(element => 
              element.shape && element.shape.text && 
              (element.shape.placeholder?.type === 'TITLE' || element.shape.placeholder?.type === 'CENTERED_TITLE')
            );
            
            if (titleElement && titleElement.objectId) {
              // タイトル要素が見つかった場合、テキストを更新
              await slides.presentations.batchUpdate({
                presentationId,
                requestBody: {
                  requests: [
                    {
                      deleteText: {
                        objectId: titleElement.objectId,
                        textRange: {
                          type: 'ALL'
                        }
                      }
                    },
                    {
                      insertText: {
                        objectId: titleElement.objectId,
                        text: newSlideTitle
                      }
                    }
                  ]
                }
              });
            }
          }
        } catch (titleUpdateError) {
          console.log('タイトル更新はスキップされました:', titleUpdateError);
          // タイトル更新に失敗しても、スライドのコピー自体は成功しているので続行
        }
      }

      return {
        status: 'success',
        message: `スライド "${newSlideTitle || sourceSlideId}" をコピーしました`,
        presentationId: presentationId,
        sourceSlideId: sourceSlideId,
        duplicatedSlideId: duplicateSlideObjectId,
        newSlideTitle: newSlideTitle,
        response: response.data
      };
    } catch (error) {
      console.error("スライドコピーエラー:", error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'スライドのコピーに失敗しました',
        presentationId,
        sourceSlideId,
        newSlideTitle
      };
    }
  }

  // 表のセルにテキストを挿入するリクエストを生成するヘルパーメソッド（IDを直接指定する版）
  private createCellTextRequestsById(
    tableObjectId: string,
    table: TableSegment
  ): any[] {
    const requests: any[] = [];

    // セルを走査してテキスト挿入リクエストを生成
    for (let r = 0; r < table.rows; r++) {
      for (let c = 0; c < table.columns; c++) {
        const cellText = table.cells[r][c];

        // セルにテキストがある場合、ループ変数を使って直接cellLocationを指定
        if (cellText) {
          requests.push({
            insertText: {
              objectId: tableObjectId,
              cellLocation: {
                rowIndex: r,
                columnIndex: c
              },
              text: cellText,
              insertionIndex: 0
            }
          });
        }
      }
    }

    return requests;
  }
} 