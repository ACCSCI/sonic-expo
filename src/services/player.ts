// Player.ts - 简化版 API，使用 PlayerStore 状态机
// 这个文件提供向后兼容的 API，实际逻辑在 PlayerStore.ts

import { playerStore, Track } from './PlayerStore';

export { Track };

// 初始化播放器
export async function setupPlayer(): Promise<boolean> {
  return playerStore.initialize();
}

// 加载并播放
export interface TrackInfo {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
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
  const track: Track = {
    id: trackInfo.id,
    url: trackInfo.url,
    title: trackInfo.title,
    artist: trackInfo.artist,
    artwork: trackInfo.artwork,
    duration: trackInfo.duration,
  };

  // 订阅状态变化
  if (onStatusUpdate) {
    const unsubscribe = playerStore.subscribe((status) => {
      onStatusUpdate({
        position: status.position,
        duration: status.duration,
        isPlaying: status.state === 'playing',
      });

      // 如果播放完成，调用回调
      if (status.state === 'completed' && onPlaybackFinish) {
        onPlaybackFinish();
        unsubscribe();
      }
    });
  }

  await playerStore.dispatch({ type: 'LOAD', track });
  
  const status = playerStore.getStatus();
  return {
    success: status.state === 'playing' || status.state === 'loading',
    error: status.error || undefined,
    isCorrupted: false,
  };
}

// 播放
export async function play(): Promise<void> {
  await playerStore.dispatch({ type: 'PLAY' });
}

// 暂停
export async function pause(): Promise<void> {
  await playerStore.dispatch({ type: 'PAUSE' });
}

// 停止
export async function stop(): Promise<void> {
  await playerStore.dispatch({ type: 'PAUSE' });
  await playerStore.dispatch({ type: 'SEEK', position: 0 });
}

// 定位
export async function seekTo(positionMillis: number): Promise<void> {
  await playerStore.dispatch({ type: 'SEEK', position: positionMillis });
}

// 获取状态
export async function getStatus(): Promise<{ position: number; duration: number; isPlaying: boolean } | null> {
  const status = playerStore.getStatus();
  return {
    position: status.position,
    duration: status.duration,
    isPlaying: status.state === 'playing',
  };
}

// 卸载
export async function unload(): Promise<void> {
  await playerStore.dispatch({ type: 'UNLOAD' });
}

// 获取当前曲目 ID
export function getCurrentTrackId(): string | null {
  return playerStore.getStatus().track?.id || null;
}
