import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

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
} 