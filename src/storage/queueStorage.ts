import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueuedTrack, RepeatMode } from '../context/PlayerContext';

const STORAGE_KEY = '@sonic_queue_v1';
const CURRENT_VERSION = 1;

export interface PersistedState {
  queue: QueuedTrack[];
  currentTrackId: string | null;
  position: number;
  repeatMode: RepeatMode;
  downloadedTrackIds: string[]; // 已下载的歌曲ID列表
  version: number;
}

export async function saveQueueState(
  state: Omit<PersistedState, 'version' | 'downloadedTrackIds'> & { downloadedTrackIds: string[] }
): Promise<void> {
  try {
    const data: PersistedState = {
      ...state,
      version: CURRENT_VERSION,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('[Storage] Queue state saved, downloaded tracks:', data.downloadedTrackIds.length);
  } catch (error) {
    console.error('[Storage] Failed to save queue state:', error);
  }
}

export async function loadQueueState(): Promise<PersistedState | null> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) {
      console.log('[Storage] No saved queue state found');
      return null;
    }

    const data: PersistedState = JSON.parse(json);
    
    // 版本检查（未来用于数据迁移）
    if (data.version !== CURRENT_VERSION) {
      console.log('[Storage] Version mismatch, ignoring old data');
      return null;
    }

    console.log('[Storage] Queue state loaded:', {
      queueLength: data.queue.length,
      currentTrackId: data.currentTrackId,
      position: data.position,
      repeatMode: data.repeatMode,
    });

    return data;
  } catch (error) {
    console.error('[Storage] Failed to load queue state:', error);
    return null;
  }
}

export async function clearQueueState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[Storage] Queue state cleared');
  } catch (error) {
    console.error('[Storage] Failed to clear queue state:', error);
  }
}
