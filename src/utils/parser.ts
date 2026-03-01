const BV_REGEX = /[Bb][Vv][0-9a-zA-Z]{10}/;
const SHORT_URL_REGEX = /https?:\/\/b23\.tv\/[a-zA-Z0-9]+/;
const AV_REGEX = /(?:av|AV)(\d+)/;
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const BILIBILI_URL_REGEX = /https?:\/\/(?:www\.)?bilibili\.com\/video\/[^\s<>"']*/gi;

export interface ParseUrlResult {
  bvid: string;
  page: number;
  rawUrl: string;
  fullUrl?: string;
}

function extractAllUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractBilibiliUrls(text: string): string[] {
  const matches = text.match(BILIBILI_URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

export async function resolveShortUrl(shortUrl: string): Promise<string | null> {
  try {
    // 方法1: 直接 GET 请求获取重定向
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(shortUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });

    clearTimeout(timeoutId);
    
    const finalUrl = response.url;
    console.log('短链 GET 响应 URL:', finalUrl);
    
    if (finalUrl && finalUrl.includes('bilibili.com/video/')) {
      return finalUrl;
    }
    
    // 方法2: 使用 B站 API 解析短链
    const encodedUrl = encodeURIComponent(shortUrl);
    const apiUrl = `https://api.bilibili.com/x/share/link?url=${encodedUrl}`;
    
    console.log('尝试 B站 API 解析短链:', apiUrl);
    
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });
    
    const data = await apiResponse.json();
    console.log('B站 API 响应:', JSON.stringify(data));
    
    if (data.code === 0 && data.data?.url) {
      return data.data.url;
    }
    
    console.error('短链解析失败: 两个方法都未能获取真实URL');
    return null;
  } catch (err) {
    console.error('短链解析异常:', err);
    return null;
  }
}

export function extractBVNumber(text: string): string | null {
  const match = text.match(BV_REGEX);
  if (match) {
    return match[0];
  }
  return null;
}

export function extractAVNumber(text: string): string | null {
  const match = text.match(AV_REGEX);
  if (match) {
    return match[1];
  }
  return null;
}

export function extractPageNumber(url: string): number {
  try {
    const decodedUrl = decodeURIComponent(url);
    const urlObj = new URL(decodedUrl);
    const p = urlObj.searchParams.get('p') || urlObj.searchParams.get('page');
    if (p) {
      const pageNum = parseInt(p, 10);
      return isNaN(pageNum) ? 1 : Math.max(1, pageNum);
    }
  } catch {
    // URL 解析失败，忽略
  }
  return 1;
}

export async function parseInput(input: string): Promise<ParseUrlResult | null> {
  const trimmed = input.trim();
  
  if (!trimmed) {
    return null;
  }
  
  // 1. 提取所有 URL（优先处理 URL）
  const allUrls = extractAllUrls(trimmed);
  const bilibiliUrls = extractBilibiliUrls(trimmed);
  
  console.log('提取的 URLs:', allUrls);
  console.log('B站 URLs:', bilibiliUrls);
  
  // 2. 优先处理 B站 完整链接
  for (const url of bilibiliUrls) {
    const bvid = extractBVNumber(url);
    if (bvid) {
      console.log('从完整链接提取 BV:', bvid);
      return {
        bvid,
        page: extractPageNumber(url),
        rawUrl: url,
      };
    }
  }
  
  // 3. 处理短链接
  for (const url of allUrls) {
    if (SHORT_URL_REGEX.test(url)) {
      console.log('解析短链:', url);
      try {
        const resolvedUrl = await resolveShortUrl(url);
        console.log('短链解析结果:', resolvedUrl);
        
        if (resolvedUrl && resolvedUrl.includes('bilibili.com/video/')) {
          const bvid = extractBVNumber(resolvedUrl);
          if (bvid) {
            console.log('从解析后 URL 提取 BV:', bvid);
            return {
              bvid,
              page: extractPageNumber(resolvedUrl),
              rawUrl: resolvedUrl,
              fullUrl: resolvedUrl,
            };
          }
        }
      } catch (err) {
        console.log('短链解析失败:', url, err);
      }
    }
  }
  
  // 4. 最后才尝试从原始文本直接提取 BV 号（只有当没有 URL 时）
  const directBV = extractBVNumber(trimmed);
  if (directBV && allUrls.length === 0) {
    console.log('从原始文本提取 BV:', directBV);
    return {
      bvid: directBV,
      page: extractPageNumber(trimmed),
      rawUrl: trimmed,
    };
  }
  
  return null;
}