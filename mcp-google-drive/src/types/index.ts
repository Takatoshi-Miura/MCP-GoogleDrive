// 共通型定義
export interface FileInfo {
  id?: string;
  name?: string;
  mimeType?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  size?: string;
}

export interface SheetInfo {
  title: string;
  sheetId: number;
  index: number;
  sheetType: string;
  rowCount: number;
  columnCount: number;
}

export interface TabInfo {
  tabId: string;
  title: string;
  level: number;
  hasChildTabs: boolean;
  isDefaultTab: boolean;
  text?: string;
}

export interface DocumentInfo {
  documentId: string;
  title: string;
  revisionId: string;
  tabCount: number;
  tabs: TabInfo[];
}

export interface SlideInfo {
  presentation: {
    presentationId: string;
    title: string;
    totalSlides: number;
  };
  slide: any;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: string;
  message?: string;
}

export type FileType = 'all' | 'sheets' | 'docs' | 'presentations' | 'pdf'; 