import AsyncStorage from '@react-native-async-storage/async-storage';

const PROGRESS_KEY = '@sonic_playback_progress_v1';
const CURRENT_VERSION = 1;

export interface PlaybackProgress {
  trackId: string;
  position: number;
  duration: number;
  timestamp: number;
  isPlaying: boolean;
  version: number;
}

let lastSavedData: PlaybackProgress | null = null;

export function shouldSaveProgress(
  newData: Omit<PlaybackProgress, 'version'>,
  lastData: PlaybackProgress | null
): boolean {
  if (!lastData) return true;
  
  const positionDiff = Math.abs(newData.position - lastData.position);
  const stateChanged = newData.isPlaying !== lastData.isPlaying;
  const trackChanged = newData.trackId !== lastData.trackId;
  const timeDiff = Date.now() - lastData.timestamp;
  
  return positionDiff > 1000 || stateChanged || trackChanged || timeDiff > 10000;
}

export async function saveProgressToStorage(
  data: Omit<PlaybackProgress, 'version'>
): Promise<boolean> {
  try {
    if (!shouldSaveProgress(data, lastSavedData)) {
      return true;
    }

    const progressData: PlaybackProgress = {
      ...data,
      version: CURRENT_VERSION,
    };

    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));
    lastSavedData = progressData;
    
    console.log('[ProgressStorage] Progress saved:', {
      trackId: data.trackId,
      position: Math.floor(data.position / 1000) + 's',
      isPlaying: data.isPlaying,
    });
    
    return true;
  } catch (error) {
    console.error('[ProgressStorage] Failed to save progress:', error);
    return false;
  }
}

export async function loadProgressFromStorage(): Promise<PlaybackProgress | null> {
  try {
    const json = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!json) {
      console.log('[ProgressStorage] No saved progress found');
      return null;
    }

    const data: PlaybackProgress = JSON.parse(json);
    
    if (data.version !== CURRENT_VERSION) {
      console.log('[ProgressStorage] Version mismatch, clearing old data');
      await clearProgressStorage();
      return null;
    }

    console.log('[ProgressStorage] Progress loaded:', {
      trackId: data.trackId,
      position: Math.floor(data.position / 1000) + 's',
      savedAt: new Date(data.timestamp).toLocaleTimeString(),
    });

    return data;
  } catch (error) {
    console.error('[ProgressStorage] Failed to load progress:', error);
    return null;
  }
}

export async function clearProgressStorage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY);
    lastSavedData = null;
    console.log('[ProgressStorage] Progress storage cleared');
  } catch (error) {
    console.error('[ProgressStorage] Failed to clear progress:', error);
  }
}

export function validateProgressPosition(
  position: number,
  duration: number
): number {
  if (duration <= 0) return 0;
  
  if (position >= duration * 0.9) {
    console.log('[ProgressStorage] Position > 90%, resetting to 10%');
    return Math.floor(duration * 0.1);
  }
  
  if (position >= duration) {
    return 0;
  }
  
  return Math.max(0, position);
}
