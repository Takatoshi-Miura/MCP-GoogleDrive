import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export async function getDocumentComments(
  auth: OAuth2Client,
  documentId: string
) {
  try {
    const drive = google.drive({ version: 'v3', auth });

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