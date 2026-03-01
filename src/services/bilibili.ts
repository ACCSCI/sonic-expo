import { VideoInfo, ParseResult, AudioUrlResult } from '../types';
import { scrapeVideoInfo, scrapeFromUrl } from './scraper';

const BILIBILI_REFERER = 'https://www.bilibili.com';
const VIDEO_API_URL = 'https://api.bilibili.com/x/web-interface/view';
const VIDEO_DETAIL_API_URL = 'https://api.bilibili.com/x/web-interface/view/detail';
const PLAYURL_API_URL = 'https://api.bilibili.com/x/player/playurl';

interface ViewResponse {
  code: number;
  message: string;
  data: {
    bvid: string;
    title: string;
    pic: string;
    cid: number;
    pages: {
      cid: number;
      page: number;
      part: string;
      duration: number;
    }[];
    owner: {
      name: string;
    };
    duration: number;
  };
}

interface PlayUrlResponse {
  code: number;
  message: string;
  data: {
    durl: {
      url: string;
      length: number;
    }[];
  };
}

export async function getVideoInfoFromUrl(videoUrl: string): Promise<ParseResult> {
  return await scrapeFromUrl(videoUrl);
}

export async function getVideoInfo(bvid: string): Promise<ParseResult> {
  try {
    const url = `${VIDEO_API_URL}?bvid=${bvid}`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': BILIBILI_REFERER,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error: ${response.status}`,
      };
    }

    const data: ViewResponse = await response.json();

    console.log('B站 API 响应:', JSON.stringify(data));

    if (data.code !== 0) {
      return {
        success: false,
        error: data.message || '获取视频信息失败',
      };
    }

    const title = data.data.title;
    const author = data.data.owner?.name;
    
    if (!title || title.length < 2 || !author) {
      console.log('API 数据异常，尝试网页抓取...');
      return await scrapeVideoInfo(bvid);
    }

    const videoInfo: VideoInfo = {
      bvid: data.data.bvid,
      title: data.data.title,
      pic: (data.data.pic || '').replace('http://', 'https://'),
      cid: data.data.cid || 0,
      pages: (data.data.pages || []).map((page) => ({
        cid: page.cid,
        page: page.page,
        part: page.part,
        duration: page.duration,
      })),
      author: data.data.owner?.name || '未知',
      duration: data.data.duration || 0,
    };

    return {
      success: true,
      video: videoInfo,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络错误',
    };
  }
}

async function getVideoInfoFromDetail(bvid: string): Promise<ParseResult> {
  try {
    const url = `${VIDEO_DETAIL_API_URL}?bvid=${bvid}`;
    
    const response = await fetch(url, {
      headers: {
        'Referer': BILIBILI_REFERER,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP error: ${response.status}` };
    }

    const detailData = await response.json();
    console.log('B站 Detail API 响应:', JSON.stringify(detailData));

    if (detailData.code !== 0 || !detailData.data) {
      return { success: false, error: detailData.message || 'detail API 失败' };
    }

    const videoData = detailData.data?.View;
    const pageData = detailData.data?.pages?.[0];

    if (!videoData) {
      return { success: false, error: '视频数据为空' };
    }

    const videoInfo: VideoInfo = {
      bvid: videoData.bvid || bvid,
      title: videoData.title || '未知标题',
      pic: (videoData.pic || '').replace('http://', 'https://'),
      cid: pageData?.cid || 0,
      pages: (detailData.data?.pages || []).map((page: any) => ({
        cid: page.cid,
        page: page.page,
        part: page.part,
        duration: page.duration,
      })),
      author: videoData.owner?.name || videoData.author || '未知',
      duration: videoData.duration || 0,
    };

    return { success: true, video: videoInfo };
  } catch {
    return { success: false, error: 'detail API 请求失败' };
  }
}

export async function getAudioUrl(cid: number, bvid: string, qn: number = 80): Promise<AudioUrlResult> {
  try {
    const url = `${PLAYURL_API_URL}?cid=${cid}&bvid=${bvid}&qn=${qn}&fnval=16`;
    console.log('获取音频 URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'Referer': BILIBILI_REFERER,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error: ${response.status}`,
      };
    }

    const data = await response.json();
    console.log('音频 API 响应 code:', data.code);

    if (data.code !== 0) {
      return {
        success: false,
        error: data.message || '获取音频地址失败',
      };
    }

    // 从 dash.audio 获取音频 URL
    const dash = data.data?.dash;
    if (dash && dash.audio && dash.audio.length > 0) {
      const audioStreams = dash.audio.sort((a: any, b: any) => b.id - a.id);
      const audio = audioStreams[0];
      // 优先使用 backupUrl，其次是 baseUrl
      const audioUrl = (audio.backupUrl && audio.backupUrl[0]) || audio.baseUrl || audio.base_url;
      console.log('音频 URL 获取成功');
      console.log('音频 URL:', audioUrl?.substring(0, 100));
      return {
        success: true,
        url: audioUrl,
      };
    }

    // 备用：从 durl 获取
    if (data.data?.durl && data.data.durl.length > 0) {
      const audioUrl = data.data.durl[0].url;
      console.log('从 durl 获取音频 URL');
      return {
        success: true,
        url: audioUrl,
      };
    }

    return {
      success: false,
      error: '未找到音频流',
    };
  } catch (error) {
    console.log('获取音频异常:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络错误',
    };
  }
}