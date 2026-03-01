export interface Part {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface VideoInfo {
  bvid: string;
  title: string;
  pic: string;
  cid: number;
  pages: Part[];
  author: string;
  duration: number;
}

export interface ParseResult {
  success: boolean;
  video?: VideoInfo;
  error?: string;
}

export interface AudioUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface Track {
  id: string;
  bvid: string;
  title: string;
  author: string;
  cover: string;
  cid: number;
  page: number;
  partTitle: string;
  audioUrl: string;
  duration: number;
}