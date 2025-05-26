import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export async function getSpreadsheetComments(
  auth: OAuth2Client,
  spreadsheetId: string
) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // スプレッドシートの基本情報を取得
    const spreadsheetResponse = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetList = spreadsheetResponse.data.sheets || [];
    const comments = [];

    // Drive APIを使用してファイル全体のコメントを取得
    const commentsResponse = await drive.comments.list({
      fileId: spreadsheetId,
      fields: 'comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent,replies)',
    });

    const allComments = commentsResponse.data.comments || [];

    // 各シートごとにコメントを整理
    for (const sheet of sheetList) {
      const sheetName = sheet.properties?.title || '';
      const sheetId = sheet.properties?.sheetId || 0;

      // このシートに関連するコメントをフィルタリング
      const sheetComments = allComments.filter(comment => {
        const quotedContent = comment.quotedFileContent;
        if (!quotedContent) return false;
        
        // スプレッドシートのコメントかチェック
        if (quotedContent.mimeType !== 'application/vnd.google-apps.spreadsheet') {
          return false;
        }

        // シート名がコメントの範囲に含まれているかチェック
        const range = quotedContent.value || '';
        return range.includes(sheetName) || range.includes(`gid=${sheetId}`);
      }).map(comment => ({
        commentId: comment.id,
        range: comment.quotedFileContent?.value || '',
        author: comment.author?.displayName || comment.author?.emailAddress || '',
        content: comment.content || '',
        createdTime: comment.createdTime,
        modifiedTime: comment.modifiedTime,
        resolved: comment.resolved || false,
        replies: comment.replies?.map(reply => ({
          author: reply.author?.displayName || reply.author?.emailAddress || '',
          content: reply.content || '',
          createdTime: reply.createdTime,
        })) || [],
      }));

      comments.push({
        sheetName,
        sheetId,
        comments: sheetComments,
      });
    }

    return {
      status: 'success',
      spreadsheetId,
      totalComments: allComments.length,
      comments,
    };
  } catch (error) {
    console.error('Error getting spreadsheet comments:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
} 