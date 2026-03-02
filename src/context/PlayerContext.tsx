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
import { AppState, AppStateStatus } from "react-native";
import { PlayerState, playerStore } from "../services/PlayerStore";
import { loadQueueState, saveQueueState } from "../storage/queueStorage";
import {
  saveProgressToStorage,
  loadProgressFromStorage,
  validateProgressPosition,
} from "../storage/progressStorage";
import { getDownloadedFilesInfo } from "../services/download";
import { restoreAndLoadAudio, VideoMetadata } from "../services/audioLoader";

export type RepeatMode = "off" | "all" | "one" | "shuffle";

export const REPEAT_MODES: RepeatMode[] = ["off", "all", "one", "shuffle"];

export interface QueuedTrack {
  id: string;
  bvid: string;
  cid: string;  // 添加 cid 用于精确匹配下载文件
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
    cid: string,
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
  // 恢复状态
  isRestoring: boolean;
  restoredTrackMetadata: VideoMetadata | null;
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
  
  // 恢复状态
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoredTrackMetadata, setRestoredTrackMetadata] = useState<VideoMetadata | null>(null);

  // 下载状态 - 使用 Set 存储已下载的歌曲ID
  const [downloadedTracks, setDownloadedTracks] = useState<Set<string>>(
    new Set(),
  );

  // 用于避免重复处理 completed 状态
  const lastCompletedTrackId = useRef<string | null>(null);
  
  // 防抖保存进度的定时器
  const saveProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 上次保存的进度信息，用于防抖判断
  const lastProgressRef = useRef<{
    trackId: string;
    position: number;
    timestamp: number;
  } | null>(null);

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
            break;

          case "shuffle":
            // 随机模式：随机播放下一首
            console.log("[PlayerContext] Shuffle: playing random track");
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

  // 保存进度到存储
  const saveCurrentProgress = useCallback(async () => {
    if (!currentTrack || playerDuration <= 0) return;
    
    await saveProgressToStorage({
      trackId: currentTrack.id,
      position: playerPosition,
      duration: playerDuration,
      timestamp: Date.now(),
      isPlaying: playerState === 'playing',
    });
    
    lastProgressRef.current = {
      trackId: currentTrack.id,
      position: playerPosition,
      timestamp: Date.now(),
    };
  }, [currentTrack, playerPosition, playerDuration, playerState]);

  // 防抖保存进度（播放中每5秒）
  const debouncedSaveProgress = useCallback(() => {
    if (saveProgressTimer.current) {
      clearTimeout(saveProgressTimer.current);
    }
    
    saveProgressTimer.current = setTimeout(() => {
      if (playerState === 'playing' && currentTrack) {
        saveCurrentProgress();
      }
    }, 5000);
  }, [playerState, currentTrack, saveCurrentProgress]);

  const setCurrentTrack = useCallback(async (track: QueuedTrack | null) => {
    // 如果切换歌曲，先保存当前歌曲进度
    if (currentTrack && currentTrack.id !== track?.id) {
      await saveCurrentProgress();
    }
    
    setCurrentTrackState(track);
    
    // 清除之前的定时器
    if (saveProgressTimer.current) {
      clearTimeout(saveProgressTimer.current);
      saveProgressTimer.current = null;
    }
  }, [currentTrack, saveCurrentProgress]);

  // AppState 监听：退后台时保存进度
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        console.log('[PlayerContext] App going to background, saving progress...');
        saveCurrentProgress();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [saveCurrentProgress]);

  // 播放中防抖保存和暂停立即保存
  useEffect(() => {
    if (playerState === 'playing') {
      debouncedSaveProgress();
    } else if (playerState === 'paused') {
      if (saveProgressTimer.current) {
        clearTimeout(saveProgressTimer.current);
        saveProgressTimer.current = null;
      }
      saveCurrentProgress();
    }
  }, [playerState, debouncedSaveProgress, saveCurrentProgress]);

  // 初始化：从存储加载队列状态和播放进度，并自动加载音频
  useEffect(() => {
    const init = async () => {
      // 并行加载队列和进度
      const [savedQueue, savedProgress] = await Promise.all([
        loadQueueState(),
        loadProgressFromStorage(),
      ]);
      
      if (savedQueue) {
        setQueue(savedQueue.queue);
        setRepeatMode(savedQueue.repeatMode);

        // 恢复当前播放歌曲
        let trackToRestore: QueuedTrack | null = null;
        let positionToRestore = 0;
        
        if (savedProgress) {
          // 优先使用 progressStorage 的进度
          trackToRestore = savedQueue.queue.find((t) => t.id === savedProgress.trackId) || null;
          positionToRestore = validateProgressPosition(savedProgress.position, savedProgress.duration);
          console.log(`[PlayerContext] Restoring from progress storage: ${savedProgress.trackId} at ${Math.floor(positionToRestore/1000)}s`);
        } else if (savedQueue.currentTrackId) {
          // 回退到 queueStorage
          trackToRestore = savedQueue.queue.find((t) => t.id === savedQueue.currentTrackId) || null;
          positionToRestore = savedQueue.position;
        }
        
        if (trackToRestore) {
          setCurrentTrackState(trackToRestore);
          
          // 自动加载音频
          setIsRestoring(true);
          const result = await restoreAndLoadAudio(trackToRestore, positionToRestore);
          if (result.success && result.track) {
            setRestoredTrackMetadata({
              title: result.track.title,
              author: result.track.artist,
              artwork: result.track.artwork,
              duration: result.track.duration,
              cid: trackToRestore.cid,
            });
          }
          setIsRestoring(false);
        }

        // 扫描下载目录并匹配已下载的歌曲（使用 cid 精确匹配）
        const downloadedFiles = await getDownloadedFilesInfo();
        const downloadedTrackIds = new Set<string>();
        
        for (const file of downloadedFiles) {
          // 在队列中查找匹配的 track（根据 cid 精确匹配）
          const matchedTrack = savedQueue.queue.find((t) => t.cid === file.cid);
          if (matchedTrack) {
            downloadedTrackIds.add(matchedTrack.id);
            console.log(`[PlayerContext] Found downloaded track: ${matchedTrack.id} (cid: ${file.cid})`);
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
      setCurrentTrack(firstTrack);
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
      setCurrentTrack(nextTrack);
      if (repeatMode === "shuffle" && nextTrack.id !== currentTrack?.id) {
        setShuffleHistory((prev) => [...prev.slice(-49), nextTrack!.id]);
      }
    }
    return nextTrack;
  }, [queue, currentTrackIndex, repeatMode, getRandomTrack, currentTrack, setCurrentTrack]);

  // 自动播放下一首（用于播放完成后）
  // 注意：播放完成后的自动下一首逻辑已直接在 PlayerStore 订阅中处理

  // 手动点击下一首（不受单曲循环影响）
  const skipToNext = useCallback((): QueuedTrack | null => {
    if (queue.length === 0) return null;

    let nextTrack: QueuedTrack | null = null;

    if (currentTrackIndex === -1) {
      nextTrack = queue[0];
    } else if (repeatMode === "shuffle") {
      // 随机模式：随机播放下一首
      nextTrack = getRandomTrack();
    } else if (currentTrackIndex < queue.length - 1) {
      nextTrack = queue[currentTrackIndex + 1];
    } else {
      if (repeatMode === "off") {
        return null;
      } else {
        nextTrack = queue[0];
      }
    }

    if (nextTrack) {
      setCurrentTrack(nextTrack);
      if (repeatMode === "shuffle" && nextTrack.id !== currentTrack?.id) {
        setShuffleHistory((prev) => [...prev.slice(-49), nextTrack!.id]);
      }
    }
    return nextTrack;
  }, [queue, currentTrackIndex, repeatMode, getRandomTrack, currentTrack, setCurrentTrack]);

  const playPreviousTrack = useCallback((): QueuedTrack | null => {
    if (!hasPreviousTrack) return null;
    const prevIndex = currentTrackIndex - 1;
    const prevTrack = queue[prevIndex];
    setCurrentTrack(prevTrack);
    return prevTrack;
  }, [hasPreviousTrack, currentTrackIndex, queue, setCurrentTrack]);

  const addTrack = useCallback(
    (
      bvid: string,
      cid: string,
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
              cid,
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
        isRestoring,
        restoredTrackMetadata,
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
