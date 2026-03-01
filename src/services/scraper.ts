import { VideoInfo } from '../types';

const BILIBILI_REFERER = 'https://www.bilibili.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cleanVideoUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const bvidMatch = pathname.match(/[Bb][Vv][0-9a-zA-Z]{10}/);
    if (bvidMatch) {
      return `https://www.bilibili.com/video/${bvidMatch[0]}`;
    }
  } catch {}
  return url;
}

export async function scrapeFromUrl(videoUrl: string) {
  try {
    const cleanUrl = cleanVideoUrl(videoUrl);
    console.log('从URL抓取 (cleaned):', cleanUrl);
    
    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': BILIBILI_REFERER,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    console.log('从URL抓取 - HTTP状态:', response.status);
    if (!response.ok) {
      return { success: false, error: `HTTP error: ${response.status}` };
    }

    const html = await response.text();
    console.log('从URL抓取 - HTML长度:', html.length);
    console.log('从URL抓取 - HTML前500字符:', html.substring(0, 500));
    
    // 从 <title> 提取标题
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace('_哔哩哔哩_bilibili', '').trim() : '';
    console.log('从URL抓取 - 提取的标题:', title);
    
    // 从 JSON 数据中提取更多信息
    const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
    console.log('从URL抓取 - INITIAL_STATE 找到:', !!initialStateMatch);
    
    if (initialStateMatch) {
      try {
        const initialState = JSON.parse(initialStateMatch[1]);
        console.log('从URL抓取 - INITIAL_STATE 解析成功');
        
        // 尝试多种数据结构
        const videoData = initialState?.videoData || initialState?.videoInfo || initialState?.page?.videoData;
        console.log('从URL抓取 - videoData存在:', !!videoData);
        
        if (videoData) {
          const cover = (videoData.pic || videoData.cover || '').replace('http://', 'https://');
          const author = videoData.owner?.name || videoData.author || videoData.upName || '';
          
          console.log('从URL抓取 - 提取到:', { title: videoData.title, author, cover, cid: videoData.cid });
          
          return {
            success: true,
            video: {
              bvid: videoData.bvid || '',
              title: videoData.title || title || '未知标题',
              pic: cover,
              cid: videoData.cid || 0,
              pages: [],
              author: author || '未知',
              duration: videoData.duration || 0,
            } as VideoInfo,
          };
        }
      } catch (e) {
        console.log('从URL抓取 - 解析 INITIAL_STATE 失败:', e);
      }
    }
    
    // 备用方法：从 playinfo 提取
    const playInfoMatch = html.match(/window\.__playinfo__\s*=\s*({[\s\S]*?});/);
    console.log('从URL抓取 - playinfo 找到:', !!playInfoMatch);
    if (playInfoMatch) {
      try {
        const playInfo = JSON.parse(playInfoMatch[1]);
        console.log('从URL抓取 - playinfo 解析成功');
      } catch (e) {
        console.log('从URL抓取 - 解析 playinfo 失败:', e);
      }
    }

    console.log('从URL抓取 - 最终标题:', title);
    
    if (!title) {
      return { success: false, error: '无法从网页提取视频信息 - 标题为空，可能被反爬' };
    }

    return {
      success: true,
      video: {
        bvid: '',
        title,
        pic: '',
        cid: 0,
        pages: [],
        author: '未知',
        duration: 0,
      } as VideoInfo,
    };
  } catch (error) {
    console.log('从URL抓取 - 异常:', error);
    return { success: false, error: error instanceof Error ? error.message : '抓取失败' };
  }
}

export async function scrapeVideoInfo(bvid: string) {
  return scrapeFromUrl(`https://www.bilibili.com/video/${bvid}`);
}