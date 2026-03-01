import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

export type RepeatMode = 'off' | 'all' | 'one' | 'shuffle';

export const REPEAT_MODES: RepeatMode[] = ['off', 'all', 'one', 'shuffle'];

export interface QueuedTrack {
  id: string;
  bvid: string;
  page: number;
  title?: string;
  author?: string;
  fullUrl?: string;
  addedAt: number;
}

export interface PlayerContextType {
  queue: QueuedTrack[];
  addTrack: (bvid: string, page: number, title?: string, author?: string, fullUrl?: string) => void;
  removeTrack: (id: string) => void;
  clearQueue: () => void;
  currentTrack: QueuedTrack | null;
  setCurrentTrack: (track: QueuedTrack | null) => void;
  currentTrackIndex: number;
  hasNextTrack: boolean;
  hasPreviousTrack: boolean;
  playNextTrack: () => QueuedTrack | null;
  playPreviousTrack: () => QueuedTrack | null;
  skipToNext: () => QueuedTrack | null;
  repeatMode: RepeatMode;
  toggleRepeatMode: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedTrack[]>([]);
  const [currentTrack, setCurrentTrackState] = useState<QueuedTrack | null>(null);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [shuffleHistory, setShuffleHistory] = useState<string[]>([]);

  const setCurrentTrack = useCallback((track: QueuedTrack | null) => {
    setCurrentTrackState(track);
  }, []);

  const currentTrackIndex = currentTrack 
    ? queue.findIndex(t => t.id === currentTrack.id) 
    : -1;

  const toggleRepeatMode = useCallback(() => {
    setRepeatMode(prev => {
      const currentIndex = REPEAT_MODES.indexOf(prev);
      const nextIndex = (currentIndex + 1) % REPEAT_MODES.length;
      return REPEAT_MODES[nextIndex];
    });
  }, []);

  const hasNextTrack = useMemo(() => {
    if (currentTrackIndex === -1) return false;
    if (queue.length === 0) return false;
    if (queue.length === 1) return false; // 只有一首歌时禁用下一首
    switch (repeatMode) {
      case 'off':
        return currentTrackIndex < queue.length - 1;
      case 'all':
      case 'one':
      case 'shuffle':
        return true;
      default:
        return currentTrackIndex < queue.length - 1;
    }
  }, [currentTrackIndex, queue.length, repeatMode]);

  const hasPreviousTrack = useMemo(() => {
    if (currentTrackIndex === -1) return false;
    if (queue.length === 0) return false;
    if (queue.length === 1) return false; // 只有一首歌时禁用上一首
    switch (repeatMode) {
      case 'off':
      case 'all':
      case 'one':
      case 'shuffle':
        return currentTrackIndex > 0;
      default:
        return currentTrackIndex > 0;
    }
  }, [currentTrackIndex, queue.length, repeatMode]);

  const getRandomTrack = useCallback((): QueuedTrack | null => {
    if (queue.length === 0) return null;
    if (queue.length === 1) return queue[0];
    
    const availableIndices = queue
      .map((_, index) => index)
      .filter(index => index !== currentTrackIndex);
    
    if (availableIndices.length === 0) return queue[currentTrackIndex];
    
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return queue[randomIndex];
  }, [queue, currentTrackIndex]);

  const playNextTrack = useCallback((): QueuedTrack | null => {
    if (queue.length === 0) return null;
    if (currentTrackIndex === -1) {
      const firstTrack = queue[0];
      setCurrentTrackState(firstTrack);
      return firstTrack;
    }

    let nextTrack: QueuedTrack | null = null;

    switch (repeatMode) {
      case 'off':
        if (currentTrackIndex < queue.length - 1) {
          nextTrack = queue[currentTrackIndex + 1];
        } else {
          return null;
        }
        break;
      case 'all':
        if (currentTrackIndex < queue.length - 1) {
          nextTrack = queue[currentTrackIndex + 1];
        } else {
          nextTrack = queue[0];
        }
        break;
      case 'one':
        nextTrack = queue[currentTrackIndex];
        break;
      case 'shuffle':
        nextTrack = getRandomTrack();
        break;
      default:
        if (currentTrackIndex < queue.length - 1) {
          nextTrack = queue[currentTrackIndex + 1];
        } else {
          return null;
        }
    }

    if (nextTrack) {
      setCurrentTrackState(nextTrack);
      if (repeatMode === 'shuffle' && nextTrack.id !== currentTrack?.id) {
        setShuffleHistory(prev => [...prev.slice(-49), nextTrack!.id]);
      }
    }
    return nextTrack;
  }, [queue, currentTrackIndex, repeatMode, getRandomTrack, currentTrack]);

  // 手动点击下一首（不受单曲循环影响）
  const skipToNext = useCallback((): QueuedTrack | null => {
    if (queue.length === 0) return null;
    
    let nextIndex: number;
    if (currentTrackIndex === -1) {
      nextIndex = 0;
    } else if (currentTrackIndex < queue.length - 1) {
      nextIndex = currentTrackIndex + 1;
    } else {
      // 到最后一首
      if (repeatMode === 'off') {
        return null;
      } else {
        nextIndex = 0;
      }
    }
    
    const nextTrack = queue[nextIndex];
    setCurrentTrackState(nextTrack);
    return nextTrack;
  }, [queue, currentTrackIndex, repeatMode]);


  const playPreviousTrack = useCallback((): QueuedTrack | null => {
    if (!hasPreviousTrack) return null;
    const prevIndex = currentTrackIndex - 1;
    const prevTrack = queue[prevIndex];
    setCurrentTrackState(prevTrack);
    return prevTrack;
  }, [hasPreviousTrack, currentTrackIndex, queue]);

  const addTrack = useCallback((bvid: string, page: number, title?: string, author?: string, fullUrl?: string) => {
    const id = `${bvid}_${page}`;
    setQueue(prev => {
      const exists = prev.some(t => t.id === id);
      if (!exists) {
        return [...prev, {
          id,
          bvid,
          page,
          fullUrl,
          title: title || `BV: ${bvid} P${page}`,
          author: author || '未知UP主',
          addedAt: Date.now(),
        }];
      }
      return prev;
    });
  }, []);

  const removeTrack = useCallback((id: string) => {
    setQueue(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (currentTrack?.id === id) {
        setCurrentTrackState(null);
      }
      return filtered;
    });
  }, [currentTrack]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentTrackState(null);
    setShuffleHistory([]);
  }, []);

  return (
    <PlayerContext.Provider value={{
      queue,
      addTrack,
      removeTrack,
      clearQueue,
      currentTrack,
      setCurrentTrack,
      currentTrackIndex,
      hasNextTrack,
      hasPreviousTrack,
      playNextTrack,
      playPreviousTrack,
      skipToNext,
      repeatMode,
      toggleRepeatMode,
      setRepeatMode,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextType {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
