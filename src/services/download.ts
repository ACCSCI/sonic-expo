import { cacheDirectory } from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';

// 最大重试次数
const MAX_RETRIES = 3;
// 重试延迟（毫秒）
const RETRY_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadWithRetry(
  audioUrl: string,
  retryCount: number = 0
): Promise<{ success: boolean; data?: Uint8Array; error?: string }> {
  try {
    console.log(`尝试下载 (第 ${retryCount + 1}/${MAX_RETRIES} 次):`, audioUrl.substring(0, 80));
    
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    if (uint8Array.length === 0) {
      throw new Error('下载内容为空');
    }
    
    console.log('下载成功，文件大小:', uint8Array.length);
    return {
      success: true,
      data: uint8Array,
    };
  } catch (error) {
    console.log(`下载失败 (第 ${retryCount + 1} 次):`, error);
    
    if (retryCount < MAX_RETRIES - 1) {
      console.log(`${RETRY_DELAY}ms 后重试...`);
      await sleep(RETRY_DELAY);
      return downloadWithRetry(audioUrl, retryCount + 1);
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : '下载失败',
    };
  }
}

export async function downloadAudioToFile(
  audioUrl: string, 
  filename: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; localPath?: string; error?: string }> {
  try {
    // 验证 URL
    if (!audioUrl || audioUrl.length < 10) {
      return {
        success: false,
        error: '音频 URL 无效',
      };
    }
    
    const destFile = new File(Paths.cache, `${filename}.m4s`);
    const localPath = destFile.uri;
    console.log('开始下载音频到:', localPath);
    
    // 先删除旧文件（如果存在）
    if (destFile.exists) {
      try {
        await destFile.delete();
        console.log('删除旧文件');
      } catch (e) {
        console.log('删除旧文件失败:', e);
      }
    }
    
    // 使用重试机制下载
    const downloadResult = await downloadWithRetry(audioUrl);
    
    if (!downloadResult.success || !downloadResult.data) {
      return {
        success: false,
        error: downloadResult.error || '下载失败',
      };
    }
    
    // 写入文件
    await destFile.write(downloadResult.data);
    
    // 验证文件是否写入成功
    if (!destFile.exists) {
      return {
        success: false,
        error: '文件写入失败',
      };
    }
    
    console.log('写入完成, 本地路径:', destFile.uri, '文件大小:', downloadResult.data.length);
    return {
      success: true,
      localPath: destFile.uri,
    };
  } catch (error) {
    console.error('下载音频异常:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '下载错误',
    };
  }
}

export async function deleteLocalAudio(filename: string): Promise<void> {
  try {
    const file = new File(Paths.cache, `${filename}.m4s`);
    if (file.exists) {
      await file.delete();
      console.log('已删除本地音频:', file.uri);
    }
  } catch (error) {
    console.log('删除本地音频异常:', error);
  }
}

export function getCachePath(): string {
  return cacheDirectory || '';
}