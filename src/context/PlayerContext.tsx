import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface QueuedTrack {
  id: string;
  bvid: string;
  page: number;
  title?: string;
  fullUrl?: string;
  addedAt: number;
}

interface PlayerContextType {
  queue: QueuedTrack[];
  addTrack: (bvid: string, page: number, title?: string, fullUrl?: string) => void;
  removeTrack: (id: string) => void;
  clearQueue: () => void;
  currentTrack: QueuedTrack | null;
  setCurrentTrack: (track: QueuedTrack | null) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<QueuedTrack | null>(null);

  const addTrack = (bvid: string, page: number, title?: string, fullUrl?: string) => {
    const id = `${bvid}_${page}`;
    const exists = queue.some(t => t.id === id);
    
    if (!exists) {
      setQueue(prev => [...prev, {
        id,
        bvid,
        page,
        fullUrl,
        title: title || `BV: ${bvid} P${page}`,
        addedAt: Date.now(),
      }]);
    }
  };

  const removeTrack = (id: string) => {
    setQueue(prev => prev.filter(t => t.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
    setCurrentTrack(null);
  };

  return (
    <PlayerContext.Provider value={{
      queue,
      addTrack,
      removeTrack,
      clearQueue,
      currentTrack,
      setCurrentTrack,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}