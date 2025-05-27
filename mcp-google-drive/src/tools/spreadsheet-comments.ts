import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export async function getSpreadsheetComments(
  auth: OAuth2Client,
  spreadsheetId: string
) {
  try {
    const drive = google.drive({ version: 'v3', auth });

    // シンプルにDrive APIでコメントを取得
    console.log(`=== Debug: Fetching comments for ${spreadsheetId} ===`);
    
    const commentsResponse = await drive.comments.list({
      fileId: spreadsheetId,
      fields: 'comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent,replies,anchor)',
    });

    console.log('=== Raw API Response ===');
    console.log('Response status:', commentsResponse.status);
    console.log('Response data:', JSON.stringify(commentsResponse.data, null, 2));

    const allComments = commentsResponse.data.comments || [];
    console.log(`=== Found ${allComments.length} comments ===`);

    // 全コメントを単純にリストアップ
    const simpleComments = allComments.map((comment, index) => ({
      index: index + 1,
      commentId: comment.id || 'No ID',
      content: comment.content || 'No content',
      author: comment.author?.displayName || comment.author?.emailAddress || 'Unknown author',
      createdTime: comment.createdTime || 'No created time',
      modifiedTime: comment.modifiedTime || 'No modified time',
      resolved: comment.resolved || false,
      anchor: comment.anchor || 'No anchor',
      quotedFileContent: comment.quotedFileContent?.value || 'No quoted content',
      replies: comment.replies?.map(reply => ({
        author: reply.author?.displayName || reply.author?.emailAddress || 'Unknown',
        content: reply.content || 'No content',
        createdTime: reply.createdTime,
      })) || [],
      rawData: comment // 全データを含める
    }));

    return {
      status: 'success',
      spreadsheetId,
      totalComments: allComments.length,
      comments: [{
        sheetName: 'すべてのコメント（テスト）',
        sheetId: -1,
        comments: simpleComments,
      }],
      debug: {
        message: 'Simple test mode - showing all comments as-is',
        apiResponse: commentsResponse.data
      }
    };
  } catch (error) {
    console.error('=== Error in getSpreadsheetComments ===');
    console.error('Error details:', error);
    
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : 'Unknown error details',
      spreadsheetId
    };
  }
} 