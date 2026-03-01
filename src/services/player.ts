import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioStatus } from 'expo-audio';

let player: AudioPlayer | null = null;
let isLoadingTrack = false;
let currentTrackId: string | null = null;
let statusListener: ReturnType<AudioPlayer['addListener']> | null = null;

export interface TrackInfo {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
}

export async function setupPlayer(): Promise<boolean> {
  try {
    await setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
    });
    return true;
  } catch (error) {
    console.error('Error setting up audio:', error);
    return false;
  }
}

export function getCurrentTrackId(): string | null {
  return currentTrackId;
}

export interface LoadResult {
  success: boolean;
  error?: string;
  isCorrupted?: boolean;
}

export async function loadAndPlay(
  trackInfo: TrackInfo,
  onStatusUpdate?: (status: { position: number; duration: number; isPlaying: boolean }) => void,
  onPlaybackFinish?: () => void
): Promise<LoadResult> {
  // 防止并发加载
  if (isLoadingTrack) {
    console.log('已有歌曲正在加载中，忽略此次请求');
    return { success: false, error: '已有歌曲正在加载中' };
  }

  isLoadingTrack = true;

  try {
    // 如果正在播放同一首歌，不重载
    if (currentTrackId === trackInfo.id && player?.isLoaded) {
      console.log('同一首歌已在播放，不重载');
      isLoadingTrack = false;
      return { success: true };
    }

    // 彻底清理之前的播放器
    await unload();

    // 创建新播放器
    player = createAudioPlayer(trackInfo.url);
    currentTrackId = trackInfo.id;

// 设置状态监听器
    statusListener = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (status.isLoaded) {
        if (onStatusUpdate) {
          onStatusUpdate({
            position: Math.floor(status.currentTime * 1000),
            duration: Math.floor((status.duration || 0) * 1000),
            isPlaying: status.playing,
          });
        }
        // 检测播放完成
        if (status.didJustFinish && onPlaybackFinish) {
          // 重置播放器状态，让用户可以重新操作
          player = null;
          currentTrackId = null;
          if (statusListener) {
            statusListener.remove();
            statusListener = null;
          }
          onPlaybackFinish();
        }
      }
    });

    // 开始播放
    player.play();
    return { success: true };
  } catch (error) {
    console.error('Error loading audio:', error);
    currentTrackId = null;
    
    // 判断错误类型
    const errorMessage = error instanceof Error ? error.message : '播放失败';
    const isCorrupted = errorMessage.includes('corrupt') || 
                       errorMessage.includes('format') ||
                       errorMessage.includes('decoding') ||
                       errorMessage.includes('cannot parse');
    
    return { 
      success: false, 
      error: errorMessage,
      isCorrupted 
    };
  } finally {
    isLoadingTrack = false;
  }
}

export async function play(): Promise<void> {
  if (player && player.isLoaded) {
    player.play();
  }
}

export async function pause(): Promise<void> {
  if (player && player.isLoaded) {
    player.pause();
  }
}

export async function stop(): Promise<void> {
  if (player && player.isLoaded) {
    player.pause();
    player.seekTo(0);
  }
}

export async function seekTo(positionMillis: number): Promise<void> {
  if (player && player.isLoaded) {
    await player.seekTo(positionMillis / 1000);
  }
}

export async function getStatus(): Promise<{ position: number; duration: number; isPlaying: boolean } | null> {
  if (!player || !player.isLoaded) {
    return null;
  }
  
  try {
    return {
      position: Math.floor(player.currentTime * 1000),
      duration: Math.floor(player.duration * 1000),
      isPlaying: player.playing,
    };
  } catch {
    // ignore
  }
  
  return null;
}

export async function unload(): Promise<void> {
  try {
    // 清理监听器
    if (statusListener) {
      statusListener.remove();
      statusListener = null;
    }

    // 停止并清理播放器
    if (player) {
      if (player.isLoaded) {
        player.pause();
        player.seekTo(0);
      }
      player.remove();
      player = null;
    }

    currentTrackId = null;
  } catch (error) {
    console.error('Error unloading player:', error);
    // 即使出错也重置状态
    player = null;
    currentTrackId = null;
    statusListener = null;
  }
}
