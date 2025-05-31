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
} 