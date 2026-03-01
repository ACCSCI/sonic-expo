import { cacheDirectory, documentDirectory } from 'expo-file-system/legacy';
import { File, Directory, Paths } from 'expo-file-system';

// 最大重试次数
const MAX_RETRIES = 3;
// 重试延迟（毫秒）
const RETRY_DELAY = 1000;

// 永久存储目录（已下载的歌曲）
const DOWNLOAD_DIR = 'downloads';

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

// ============================================
// 缓存目录（临时播放）
// ============================================

export async function downloadAudioToCache(
  audioUrl: string, 
  filename: string,
  forceDownload: boolean = false
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
    
    // 如果不是强制下载，检查缓存文件是否存在且有效
    if (!forceDownload && destFile.exists && destFile.size > 1024) {
      console.log('使用缓存文件:', localPath, '大小:', destFile.size);
      return {
        success: true,
        localPath: localPath,
      };
    }
    
    // 如果是强制下载且文件存在，先删除旧文件
    if (forceDownload && destFile.exists) {
      try {
        await destFile.delete();
        console.log('强制重新下载，已删除旧缓存:', localPath);
      } catch (e) {
        console.log('删除旧缓存文件失败:', e);
      }
    }
    
    console.log('开始下载音频到缓存:', localPath);
    
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
    if (!destFile.exists || destFile.size === 0) {
      return {
        success: false,
        error: '文件写入失败',
      };
    }
    
    console.log('写入完成, 本地路径:', destFile.uri, '文件大小:', destFile.size);
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

// 兼容旧函数名
export async function downloadAudioToFile(
  audioUrl: string, 
  filename: string,
  onProgress?: (progress: number) => void,
  forceDownload: boolean = false
): Promise<{ success: boolean; localPath?: string; error?: string }> {
  return downloadAudioToCache(audioUrl, filename, forceDownload);
}

// ============================================
// 永久存储目录（已下载的歌曲）
// ============================================

export async function downloadToPermanentStorage(
  audioUrl: string,
  filename: string
): Promise<{ success: boolean; localPath?: string; error?: string }> {
  try {
    if (!audioUrl || audioUrl.length < 10) {
      return {
        success: false,
        error: '音频 URL 无效',
      };
    }

    // 确保下载目录存在（使用新 API）
    const downloadDir = new Directory(Paths.document, DOWNLOAD_DIR);
    if (!downloadDir.exists) {
      console.log('创建下载目录:', downloadDir.uri);
      await downloadDir.create();
    }

    const destFile = new File(downloadDir, `${filename}.m4s`);
    
    console.log('开始下载音频到永久存储:', destFile.uri);
    
    const downloadResult = await downloadWithRetry(audioUrl);
    
    if (!downloadResult.success || !downloadResult.data) {
      return {
        success: false,
        error: downloadResult.error || '下载失败',
      };
    }
    
    await destFile.write(downloadResult.data);
    
    if (!destFile.exists || destFile.size === 0) {
      return {
        success: false,
        error: '文件写入失败',
      };
    }
    
    console.log('永久存储写入完成:', destFile.uri, '文件大小:', destFile.size);
    return {
      success: true,
      localPath: destFile.uri,
    };
  } catch (error) {
    console.error('永久存储下载异常:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '下载错误',
    };
  }
}

export async function isAudioPermanentlyDownloaded(filename: string): Promise<boolean> {
  try {
    const file = new File(Paths.document, `${DOWNLOAD_DIR}/${filename}.m4s`);
    return file.exists && file.size > 1024;
  } catch {
    return false;
  }
}

export async function getPermanentAudioPath(filename: string): Promise<string | null> {
  try {
    const file = new File(Paths.document, `${DOWNLOAD_DIR}/${filename}.m4s`);
    if (file.exists && file.size > 1024) {
      return file.uri;
    }
    return null;
  } catch {
    return null;
  }
}

export async function deletePermanentAudio(filename: string): Promise<boolean> {
  try {
    const file = new File(Paths.document, `${DOWNLOAD_DIR}/${filename}.m4s`);
    if (file.exists) {
      await file.delete();
      console.log('已删除永久存储音频:', file.uri);
      return true;
    }
    return false;
  } catch (error) {
    console.error('删除永久存储音频异常:', error);
    return false;
  }
}

// 扫描下载目录，返回已下载的歌曲ID列表（根据文件名解析）
export async function getDownloadedTrackIds(): Promise<string[]> {
  try {
    // 使用新 API：创建 Directory 实例并调用 list()
    const downloadDir = new Directory(Paths.document, DOWNLOAD_DIR);
    
    // 检查目录是否存在
    if (!downloadDir.exists) {
      return [];
    }

    // 使用新 API 读取目录内容
    const entries = downloadDir.list();
    const trackIds: string[] = [];
    
    for (const entry of entries) {
      // 只处理文件
      if (entry instanceof File) {
        const filename = entry.name;
        // 文件名格式: audio_{bvid}_{cid}.m4s
        // 提取 track ID: {bvid}_{page}
        const match = filename.match(/^audio_(BV\w+)_(\d+)\.m4s$/);
        if (match) {
          const bvid = match[1];
          const cid = match[2];
          // 构建 track ID (bvid_page)
          trackIds.push(`${bvid}_${cid}`);
        }
      }
    }
    
    console.log('[Download] Scanned downloaded files:', trackIds.length);
    return trackIds;
  } catch (error) {
    console.error('[Download] Failed to scan downloaded files:', error);
    return [];
  }
}

// 获取所有已下载的文件列表
export async function getAllDownloadedFiles(): Promise<{ filename: string; path: string; size: number }[]> {
  try {
    const downloadDir = new File(Paths.document, DOWNLOAD_DIR);
    if (!downloadDir.exists) {
      return [];
    }

    const files: { filename: string; path: string; size: number }[] = [];
    // File 类没有直接的读取目录方法，需要其他方式
    // 这里简化处理，实际使用时需要遍历目录
    return files;
  } catch {
    return [];
  }
}

// ============================================
// 缓存目录辅助函数（保留用于兼容）
// ============================================

export async function deleteLocalAudio(filename: string): Promise<void> {
  try {
    const file = new File(Paths.cache, `${filename}.m4s`);
    if (file.exists) {
      await file.delete();
      console.log('已删除缓存音频:', file.uri);
    }
  } catch (error) {
    console.log('删除缓存音频异常:', error);
  }
}

export function getCachePath(): string {
  return cacheDirectory || '';
}

export async function isAudioDownloaded(filename: string): Promise<boolean> {
  // 向后兼容，检查永久存储
  return isAudioPermanentlyDownloaded(filename);
}
