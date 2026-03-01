import { getVideoInfo, getAudioUrl } from './bilibili';
import { playerStore, Track } from './PlayerStore';
import {
  downloadAudioToCache,
  getPermanentAudioPath,
} from './download';
import { QueuedTrack } from '../context/PlayerContext';

export interface AudioLoadResult {
  success: boolean;
  track?: Track;
  error?: string;
}

export interface VideoMetadata {
  title: string;
  author: string;
  artwork: string;
  duration: number;
  cid: string;
}

async function getAudioPath(track: QueuedTrack): Promise<{ path: string; isLocal: boolean } | null> {
  // 1. 先检查永久存储（已下载）
  const permanentPath = await getPermanentAudioPath(`audio_${track.bvid}_${track.cid}`);
  if (permanentPath) {
    return { path: permanentPath, isLocal: true };
  }

  return null;
}

async function getVideoMetadata(bvid: string, page: number): Promise<{ success: boolean; metadata?: VideoMetadata; error?: string }> {
  const videoResult = await getVideoInfo(bvid);
  if (!videoResult.success || !videoResult.video) {
    return { success: false, error: videoResult.error || '获取视频信息失败' };
  }

  const video = videoResult.video;
  let cid = video.cid;
  if (video.pages.length > 0) {
    cid = video.pages[Math.min(page - 1, video.pages.length - 1)].cid;
  }

  return {
    success: true,
    metadata: {
      title: video.title,
      author: video.author,
      artwork: video.pic,
      duration: video.duration,
      cid: cid.toString(),
    },
  };
}

async function downloadAndLoadAudio(
  track: QueuedTrack,
  metadata: VideoMetadata
): Promise<AudioLoadResult> {
  const audioResult = await getAudioUrl(parseInt(metadata.cid), track.bvid);
  if (!audioResult.success || !audioResult.url) {
    return { success: false, error: audioResult.error || '获取音频失败' };
  }

  const downloadResult = await downloadAudioToCache(
    audioResult.url,
    `audio_${track.bvid}_${metadata.cid}`
  );

  if (!downloadResult.success || !downloadResult.localPath) {
    return { success: false, error: downloadResult.error || '下载失败' };
  }

  const trackData: Track = {
    id: track.id,
    url: downloadResult.localPath,
    title: metadata.title,
    artist: metadata.author,
    artwork: metadata.artwork,
    duration: metadata.duration,
  };

  return { success: true, track: trackData };
}

export async function loadAudioForTrack(
  track: QueuedTrack,
  options: {
    autoLoad?: boolean;
    onMetadataLoaded?: (metadata: VideoMetadata) => void;
  } = {}
): Promise<AudioLoadResult> {
  try {
    // 1. 检查本地文件
    const localAudio = await getAudioPath(track);

    if (localAudio) {
      // 本地文件可以直接播放，但需要获取元数据
      const metadataResult = await getVideoMetadata(track.bvid, track.page);

      const trackData: Track = {
        id: track.id,
        url: localAudio.path,
        title: track.title || track.bvid,
        artist: track.author || '未知UP主',
        artwork: metadataResult.success ? metadataResult.metadata!.artwork : '',
        duration: metadataResult.success ? metadataResult.metadata!.duration : 0,
      };

      if (metadataResult.success && options.onMetadataLoaded) {
        options.onMetadataLoaded(metadataResult.metadata!);
      }

      if (options.autoLoad) {
        await playerStore.dispatch({ type: 'LOAD', track: trackData });
      }

      return { success: true, track: trackData };
    }

    // 2. 需要下载
    const metadataResult = await getVideoMetadata(track.bvid, track.page);
    if (!metadataResult.success) {
      return { success: false, error: metadataResult.error };
    }

    const metadata = metadataResult.metadata!;

    if (options.onMetadataLoaded) {
      options.onMetadataLoaded(metadata);
    }

    if (options.autoLoad) {
      const loadResult = await downloadAndLoadAudio(track, metadata);
      if (loadResult.success) {
        await playerStore.dispatch({ type: 'LOAD', track: loadResult.track! });
      }
      return loadResult;
    }

    return { success: true };
  } catch (error) {
    console.error('[AudioLoader] Load error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '加载失败',
    };
  }
}

export async function restoreAndLoadAudio(
  track: QueuedTrack,
  position: number
): Promise<AudioLoadResult> {
  console.log('[AudioLoader] Restoring track:', track.id, 'at position:', Math.floor(position / 1000) + 's');

  // 加载音频但不自动播放，保持暂停状态
  const result = await loadAudioForTrack(track, { autoLoad: true });

  if (result.success && result.track) {
    // 等待播放器准备就绪后 seek 到恢复位置，然后暂停
    setTimeout(async () => {
      await playerStore.dispatch({ type: 'SEEK', position });
      await playerStore.dispatch({ type: 'PAUSE' }); // 确保暂停状态
      console.log('[AudioLoader] Restored to position:', Math.floor(position / 1000) + 's', '(paused)');
    }, 500);
  }

  return result;
}

// 检查音频是否已加载
export function isAudioLoaded(): boolean {
  const status = playerStore.getStatus();
  return status.track !== null && status.state !== 'idle';
}
