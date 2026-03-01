import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlayerState, playerStore } from "../services/PlayerStore";
import { loadQueueState, saveQueueState } from "../storage/queueStorage";
import { getDownloadedFilesInfo } from "../services/download";

export type RepeatMode = "off" | "all" | "one" | "shuffle";

export const REPEAT_MODES: RepeatMode[] = ["off", "all", "one", "shuffle"];

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
  addTrack: (
    bvid: string,
    page: number,
    title?: string,
    author?: string,
    fullUrl?: string,
  ) => void;
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
  // 播放器状态（从 PlayerStore 同步）
  playerState: PlayerState;
  playerPosition: number;
  playerDuration: number;
  isPlaying: boolean;
  // 下载状态
  downloadedTracks: Set<string>;
  isTrackDownloaded: (trackId: string) => boolean;
  markTrackDownloaded: (trackId: string) => void;
  markTrackNotDownloaded: (trackId: string) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedTrack[]>([]);
  const [currentTrack, setCurrentTrackState] = useState<QueuedTrack | null>(
    null,
  );
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleHistory, setShuffleHistory] = useState<string[]>([]);

  // 从 PlayerStore 同步的状态
  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [playerPosition, setPlayerPosition] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // 下载状态 - 使用 Set 存储已下载的歌曲ID
  const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(
    new Set(),
  );

  // 用于避免重复处理 completed 状态
  const lastCompletedTrackId = useRef<string | null>(null);

  // 订阅 PlayerStore 状态变化
  useEffect(() => {
    const unsubscribe = playerStore.subscribe((status) => {
      setPlayerState(status.state);
      setPlayerPosition(status.position);
      setPlayerDuration(status.duration);
      setIsPlaying(status.state === "playing");

      // 处理播放完成后的自动逻辑
      if (status.state === "completed" && currentTrack) {
        const trackId = currentTrack.id;

        // 避免对同一首歌重复处理
        if (lastCompletedTrackId.current === trackId) {
          return;
        }
        lastCompletedTrackId.current = trackId;

        // 根据重复模式决定下一步
        switch (repeatMode) {
          case "one":
            // 单曲循环：重新播放当前歌曲
            console.log("[PlayerContext] Single loop: replaying current track");
            playerStore.dispatch({ type: "PLAY" });
            break;

          case "all":
            // 列表循环：播放下一首（会循环到第一首）
            console.log("[PlayerContext] List loop: playing next track");
            handleAutoPlayNext();
            break;

          case "shuffle":
            // 随机模式：随机播放下一首
            console.log("[PlayerContext] Shuffle: playing random track");
            handleAutoPlayNext();
            break;

          case "off":
          default:
            // 不循环：停在当前位置
            console.log("[PlayerContext] No loop: staying at end");
            break;
        }
      }

      // 当切换到新歌曲时，重置 completed 标记
      if (status.state !== "completed") {
        lastCompletedTrackId.current = null;
      }
    });

    return unsubscribe;
  }, [currentTrack, repeatMode]);

  const setCurrentTrack = useCallback((track: QueuedTrack | null) => {
    setCurrentTrackState(track);
  }, []);

  // 初始化：从存储加载队列状态并扫描下载目录
  useEffect(() => {
    const init = async () => {
      const saved = await loadQueueState();
      if (saved) {
        setQueue(saved.queue);
        setRepeatMode(saved.repeatMode);

        // 恢复当前播放歌曲（检查是否在队列中）
        if (saved.currentTrackId) {
          const track = saved.queue.find((t) => t.id === saved.currentTrackId);
          if (track) {
            setCurrentTrackState(track);
            // 恢复播放进度
            setTimeout(() => {
              playerStore.dispatch({ type: "SEEK", position: saved.position });
            }, 100);
          }
        }

        // 扫描下载目录并匹配已下载的歌曲
        const downloadedFiles = await getDownloadedFilesInfo();
        const downloadedTrackIds = new Set<string>();
        
        for (const file of downloadedFiles) {
          // 在队列中查找匹配的 track（根据 bvid）
          const matchedTrack = saved.queue.find((t) => t.bvid === file.bvid);
          if (matchedTrack) {
            downloadedTrackIds.add(matchedTrack.id);
            console.log(`[PlayerContext] Found downloaded track: ${matchedTrack.id}`);
          }
        }
        
        setDownloadedTracks(downloadedTrackIds);
        console.log(`[PlayerContext] Total downloaded tracks: ${downloadedTrackIds.size}`);
      }
    };
    init();
  }, []);

  // 保存队列状态到存储
  useEffect(() => {
    saveQueueState({
      queue,
      currentTrackId: currentTrack?.id || null,
      position: playerPosition,
      repeatMode,
      downloadedTrackIds: Array.from(downloadedTracks),
    });
  }, [queue, currentTrack, playerPosition, repeatMode, downloadedTracks]);

  const currentTrackIndex = currentTrack
    ? queue.findIndex((t) => t.id === currentTrack.id)
    : -1;

  const toggleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      const currentIndex = REPEAT_MODES.indexOf(prev);
      const nextIndex = (currentIndex + 1) % REPEAT_MODES.length;
      return REPEAT_MODES[nextIndex];
    });
  }, []);

  const hasNextTrack = useMemo(() => {
    if (currentTrackIndex === -1) return false;
    if (queue.length === 0) return false;
    if (queue.length === 1) return false;
    switch (repeatMode) {
      case "off":
        return currentTrackIndex < queue.length - 1;
      case "all":
      case "one":
      case "shuffle":
        return true;
      default:
        return currentTrackIndex < queue.length - 1;
    }
  }, [currentTrackIndex, queue.length, repeatMode]);

  const hasPreviousTrack = useMemo(() => {
    if (currentTrackIndex === -1) return false;
    if (queue.length === 0) return false;
    if (queue.length === 1) return false;
    switch (repeatMode) {
      case "off":
      case "all":
      case "one":
      case "shuffle":
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
      .filter((index) => index !== currentTrackIndex);

    if (availableIndices.length === 0) return queue[currentTrackIndex];

    const randomIndex =
      availableIndices[Math.floor(Math.random() * availableIndices.length)];
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
      case "off":
        if (currentTrackIndex < queue.length - 1) {
          nextTrack = queue[currentTrackIndex + 1];
        } else {
          return null;
        }
        break;
      case "all":
        if (currentTrackIndex < queue.length - 1) {
          nextTrack = queue[currentTrackIndex + 1];
        } else {
          nextTrack = queue[0];
        }
        break;
      case "one":
        nextTrack = queue[currentTrackIndex];
        break;
      case "shuffle":
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
      if (repeatMode === "shuffle" && nextTrack.id !== currentTrack?.id) {
        setShuffleHistory((prev) => [...prev.slice(-49), nextTrack!.id]);
      }
    }
    return nextTrack;
  }, [queue, currentTrackIndex, repeatMode, getRandomTrack, currentTrack]);

  // 自动播放下一首（用于播放完成后）
  const handleAutoPlayNext = useCallback(() => {
    const nextTrack = playNextTrack();
    if (nextTrack) {
      // 触发播放将在 player.tsx 中处理
      // 这里只需要更新 currentTrack
    }
  }, [playNextTrack]);

  // 手动点击下一首（不受单曲循环影响）
  const skipToNext = useCallback((): QueuedTrack | null => {
    if (queue.length === 0) return null;

    let nextIndex: number;
    if (currentTrackIndex === -1) {
      nextIndex = 0;
    } else if (currentTrackIndex < queue.length - 1) {
      nextIndex = currentTrackIndex + 1;
    } else {
      if (repeatMode === "off") {
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

  const addTrack = useCallback(
    (
      bvid: string,
      page: number,
      title?: string,
      author?: string,
      fullUrl?: string,
    ) => {
      const id = `${bvid}_${page}`;
      setQueue((prev) => {
        const exists = prev.some((t) => t.id === id);
        if (!exists) {
          return [
            ...prev,
            {
              id,
              bvid,
              page,
              fullUrl,
              title: title || `BV: ${bvid} P${page}`,
              author: author || "未知UP主",
              addedAt: Date.now(),
            },
          ];
        }
        return prev;
      });
    },
    [],
  );

  const removeTrack = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (currentTrack?.id === id) {
          setCurrentTrackState(null);
        }
        return filtered;
      });
    },
    [currentTrack],
  );

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentTrackState(null);
    setShuffleHistory([]);
    setDownloadedTracks(new Set());
  }, []);

  // 下载状态管理方法
  const isTrackDownloaded = useCallback(
    (trackId: string): boolean => {
      return downloadedTracks.has(trackId);
    },
    [downloadedTracks],
  );

  const markTrackDownloaded = useCallback((trackId: string) => {
    setDownloadedTracks((prev) => new Set(prev).add(trackId));
  }, []);

  const markTrackNotDownloaded = useCallback((trackId: string) => {
    setDownloadedTracks((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  }, []);

  return (
    <PlayerContext.Provider
      value={{
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
        playerState,
        playerPosition,
        playerDuration,
        isPlaying,
        downloadedTracks,
        isTrackDownloaded,
        markTrackDownloaded,
        markTrackNotDownloaded,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextType {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
