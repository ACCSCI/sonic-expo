import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, 
  Image, Modal, Animated, Alert, PanResponder
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlayer, QueuedTrack } from '../../src/context/PlayerContext';
import { getVideoInfo, getAudioUrl } from '../../src/services/bilibili';
import { playerStore, Track } from '../../src/services/PlayerStore';
import { 
  downloadAudioToCache, 
  downloadToPermanentStorage,
  getPermanentAudioPath,
  deletePermanentAudio,
  isAudioPermanentlyDownloaded 
} from '../../src/services/download';
import { isAudioLoaded } from '../../src/services/audioLoader';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { showToast } from '../../src/components/ToastConfig';

// 可滚动文字组件
function ScrollingText({
  text,
  textStyle,
  containerStyle,
  speed = 30,
  delay = 1000,
  pause = 600,
  gap = 24,
}: {
  text: string;
  textStyle: any;
  containerStyle?: any;
  speed?: number;
  delay?: number;
  pause?: number;
  gap?: number;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
    translateX.setValue(0);
  }, [translateX]);

  const startAnimation = useCallback(() => {
    stopAnimation();
    const widthToUse = measuredWidth || contentWidth;
    if (!containerWidth || !widthToUse || widthToUse <= containerWidth) {
      return;
    }

    const distance = widthToUse + gap;
    const duration = (distance / speed) * 1000;
    translateX.setValue(0);
    animationRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(translateX, {
          toValue: -distance,
          duration,
          useNativeDriver: true,
        }),
        Animated.delay(pause),
        Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    animationRef.current.start();
  }, [containerWidth, contentWidth, delay, gap, measuredWidth, pause, speed, stopAnimation, translateX]);

  useEffect(() => {
    startAnimation();
    return stopAnimation;
  }, [startAnimation, stopAnimation, text]);

  const handleContainerLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    const width = event.nativeEvent.layout.width;
    if (width !== containerWidth) {
      setContainerWidth(width);
    }
  }, [containerWidth]);

  const handleTextLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    const width = event.nativeEvent.layout.width;
    if (width !== contentWidth) {
      setContentWidth(width);
    }
  }, [contentWidth]);

  const handleHiddenTextLayout = useCallback((event: { nativeEvent: { lines?: { width: number }[] } }) => {
    const line = event.nativeEvent.lines?.[0];
    if (line?.width && line.width !== measuredWidth) {
      setMeasuredWidth(line.width);
    }
  }, [measuredWidth]);

  const widthToUse = measuredWidth || contentWidth;
  const shouldScroll = widthToUse > containerWidth;
  const marqueeTextStyle = shouldScroll && widthToUse ? { width: widthToUse, minWidth: widthToUse, flexShrink: 0 } : { flexShrink: 0 };

  return (
    <View
      style={[containerStyle, { overflow: 'hidden' }]}
      onLayout={handleContainerLayout}
    >
      <Text
        style={[textStyle, { position: 'absolute', opacity: 0, left: 0, top: 0, width: 10000 }]}
        numberOfLines={1}
        onTextLayout={handleHiddenTextLayout}
      >
        {text}
      </Text>
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          transform: [{ translateX }],
        }}
      >
        <Text
          style={[textStyle, marqueeTextStyle]}
          numberOfLines={1}
          ellipsizeMode="clip"
          onLayout={handleTextLayout}
        >
          {text}
        </Text>
        {shouldScroll && (
          <>
            <View style={{ width: gap }} />
            <Text style={[textStyle, marqueeTextStyle]} numberOfLines={1} ellipsizeMode="clip">{text}</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

// 队列项组件
function QueueItem({ 
  track, 
  index, 
  isCurrent, 
  isPlaying, 
  isLoading,
  downloadStatus,
  isOffline,
  onPlay,
  onDownload,
  onDelete,
  onRemove,
  isDark
}: {
  track: QueuedTrack;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  downloadStatus: 'none' | 'downloading' | 'downloaded';
  isOffline: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRemove: () => void;
  isDark: boolean;
}) {
  const styles = getStyles(isDark);
  const canPlay = !isOffline || downloadStatus === 'downloaded';
  
  return (
    <View style={[styles.trackCard, isCurrent && styles.trackCardActive, !canPlay && styles.trackCardOffline]}>
      <View style={styles.trackInfo}>
        <Text style={[styles.trackIndex, !canPlay && styles.textOffline]}>{index + 1}</Text>
        <View style={styles.trackDetail}>
          <Text style={[styles.trackTitle, !canPlay && styles.textOffline]} numberOfLines={2}>
            {track.title || track.bvid}
          </Text>
          <Text style={[styles.trackAuthor, !canPlay && styles.textOffline]} numberOfLines={1}>
            {track.author || '未知UP主'}
          </Text>
          <Text style={[styles.trackPage, !canPlay && styles.textOffline]}>分P: {track.page}</Text>
        </View>
      </View>
      
      <View style={styles.trackActions}>
        {/* 下载按钮 */}
        <TouchableOpacity
          style={[
            styles.iconButton,
            downloadStatus === 'downloaded' && styles.iconButtonDownloaded,
            downloadStatus === 'downloading' && styles.iconButtonLoading
          ]}
          onPress={downloadStatus === 'downloaded' ? onDelete : onDownload}
          disabled={downloadStatus === 'downloading'}
        >
          {downloadStatus === 'downloading' ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Feather
              name={downloadStatus === 'downloaded' ? 'check' : 'download'}
              size={16}
              color={downloadStatus === 'downloaded' ? '#10B981' : isDark ? '#F9FAFB' : '#111827'}
            />
          )}
        </TouchableOpacity>

        {/* 播放按钮 */}
        <TouchableOpacity
          style={[
            styles.playButton, 
            isLoading && styles.buttonDisabled,
            isCurrent && isPlaying && styles.playingButton,
            !canPlay && styles.buttonOffline
          ]}
          onPress={onPlay}
          disabled={isLoading || !canPlay}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.playButtonText}>
              {!canPlay ? '无网' :
               isCurrent && isPlaying ? '播放中' : 
               isCurrent && !isPlaying ? '继续' : '播放'}
            </Text>
          )}
        </TouchableOpacity>
        
        {/* 删除按钮 */}
        <TouchableOpacity style={styles.deleteButton} onPress={onRemove}>
          <Text style={styles.deleteButtonText}>删除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PlayerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);
  const insets = useSafeAreaInsets();

  const { 
    queue, removeTrack, currentTrack, setCurrentTrack,
    hasNextTrack, hasPreviousTrack, skipToNext, playPreviousTrack,
    repeatMode, toggleRepeatMode,
    playerState, playerPosition, playerDuration, isPlaying,
    isRestoring, restoredTrackMetadata,
    downloadedTracks, isTrackDownloaded, markTrackDownloaded, markTrackNotDownloaded
  } = usePlayer();
  
  const { isOnline } = useNetworkStatus();
  
  // 本地状态
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ title: string; author: string; artwork: string } | null>(null);
  const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [progressBarPageX, setProgressBarPageX] = useState(0);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [downloadingTracks, setDownloadingTracks] = useState<Set<string>>(new Set());
  const progressBarRef = useRef<View>(null);
  const lastCompletedTrackId = useRef<string | null>(null);
  
  const isInitialized = useRef(false);

  // 初始化播放器
  useEffect(() => {
    const init = async () => {
      const success = await playerStore.initialize();
      isInitialized.current = success;
      if (!success) showToast.error('初始化失败', '无法初始化音频播放器');
    };
    init();
  }, []);

  // 同步恢复的元数据到 videoInfo
  useEffect(() => {
    if (restoredTrackMetadata) {
      setVideoInfo({
        title: restoredTrackMetadata.title,
        author: restoredTrackMetadata.author,
        artwork: restoredTrackMetadata.artwork,
      });
    }
  }, [restoredTrackMetadata]);

  // 获取歌曲音频路径（优先本地，其次网络）
  const getAudioPath = async (track: QueuedTrack): Promise<{ path: string; isLocal: boolean } | null> => {
    // 1. 先检查永久存储（已下载）
    const permanentPath = await getPermanentAudioPath(`audio_${track.bvid}_${track.page}`);
    if (permanentPath) {
      return { path: permanentPath, isLocal: true };
    }
    
    // 2. 检查缓存（之前播放过）
    // 这里简化处理，实际应该从缓存读取
    
    // 3. 没有本地文件，需要下载
    return null;
  };

  // 加载并播放歌曲
  const loadTrack = async (track: QueuedTrack, autoSkipOnError: boolean = false) => {
    if (isLoading) return;
    
    // 离线检查
    if (!isOnline) {
      const isDownloaded = downloadedTracks.has(track.id);
      if (!isDownloaded) {
        showToast.info('离线状态', '该歌曲未下载，无法播放');
        if (autoSkipOnError && hasNextTrack) {
          // 自动跳过未下载的歌曲
          setTimeout(() => handleNextTrack(true), 500);
        }
        return;
      }
    }
    
    setIsLoading(true);
    setCurrentTrack(track);

    try {
      // 检查本地文件
      const localAudio = await getAudioPath(track);
      
      if (localAudio) {
        // 使用本地文件播放
        const trackData: Track = {
          id: track.id,
          url: localAudio.path,
          title: track.title || track.bvid,
          artist: track.author || '未知UP主',
          artwork: '', // 本地文件没有封面
          duration: 0,
        };
        await playerStore.dispatch({ type: 'LOAD', track: trackData });
        showToast.success('开始播放', track.title || track.bvid);
      } else {
        // 需要下载
        const videoResult = await getVideoInfo(track.bvid);
        if (!videoResult.success || !videoResult.video) {
          showToast.error('获取视频信息失败', videoResult.error || '未知错误');
          setIsLoading(false);
          if (autoSkipOnError && hasNextTrack) {
            setTimeout(() => handleNextTrack(true), 500);
          }
          return;
        }

        const video = videoResult.video;
        setVideoInfo({ title: video.title, author: video.author, artwork: video.pic });

        let cid = video.cid;
        if (video.pages.length > 0) {
          cid = video.pages[Math.min(track.page - 1, video.pages.length - 1)].cid;
        }

        const audioResult = await getAudioUrl(cid, video.bvid);
        if (!audioResult.success || !audioResult.url) {
          showToast.error('获取音频失败', audioResult.error || '未知错误');
          setIsLoading(false);
          if (autoSkipOnError && hasNextTrack) {
            setTimeout(() => handleNextTrack(true), 500);
          }
          return;
        }

        // 下载到缓存并播放
        const downloadResult = await downloadAudioToCache(audioResult.url, `audio_${video.bvid}_${cid}`);
        if (!downloadResult.success || !downloadResult.localPath) {
          showToast.error('下载失败', downloadResult.error || '无法下载音频');
          setIsLoading(false);
          if (autoSkipOnError && hasNextTrack) {
            setTimeout(() => handleNextTrack(true), 500);
          }
          return;
        }

        const trackData: Track = {
          id: track.id,
          url: downloadResult.localPath,
          title: video.title,
          artist: video.author,
          artwork: video.pic,
          duration: video.duration,
        };

        await playerStore.dispatch({ type: 'LOAD', track: trackData });
        showToast.success('开始播放', video.title);
      }
    } catch (error) {
      console.error('Load track error:', error);
      showToast.error('加载失败', error instanceof Error ? error.message : '未知错误');
      if (autoSkipOnError && hasNextTrack) {
        setTimeout(() => handleNextTrack(true), 500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 播放控制
  const handleTogglePlay = async () => {
    if (playerState === 'playing') {
      await playerStore.dispatch({ type: 'PAUSE' });
    } else {
      // 检查音频是否已加载
      if (!isAudioLoaded() && currentTrack) {
        // 音频未加载，先加载当前歌曲
        console.log('[Player] Audio not loaded, loading track first...');
        await loadTrack(currentTrack);
      } else {
        // 音频已加载，直接播放
        await playerStore.dispatch({ type: 'PLAY' });
      }
    }
  };

  const handleNextTrack = async (autoSkip: boolean = false) => {
    if (!hasNextTrack) return;
    const nextTrack = skipToNext();
    if (nextTrack) {
      await loadTrack(nextTrack, autoSkip);
    }
  };

  const handlePreviousTrack = async () => {
    if (!hasPreviousTrack) return;
    const prevTrack = playPreviousTrack();
    if (prevTrack) {
      await loadTrack(prevTrack);
    }
  };

  useEffect(() => {
    if (playerState !== 'completed' || !currentTrack) return;
    if (lastCompletedTrackId.current === currentTrack.id) return;

    lastCompletedTrackId.current = currentTrack.id;

    const handleCompletion = async () => {
      if (isLoading || isRestoring) return;

      switch (repeatMode) {
        case 'one':
          await playerStore.dispatch({ type: 'PLAY' });
          break;
        case 'all':
        case 'shuffle':
          await handleNextTrack();
          break;
        case 'off':
        default:
          if (hasNextTrack) {
            await handleNextTrack();
          }
          break;
      }
    };

    handleCompletion();
  }, [playerState, currentTrack, repeatMode, hasNextTrack, isLoading, isRestoring, handleNextTrack]);

  useEffect(() => {
    if (playerState !== 'completed') {
      lastCompletedTrackId.current = null;
    }
  }, [playerState]);

  const clampProgressPosition = (position: number) => {
    return Math.max(0, Math.min(playerDuration, position));
  };

  const seekToPosition = async (position: number) => {
    if (playerDuration === 0) return;
    const nextPosition = clampProgressPosition(position);
    await playerStore.dispatch({ type: 'SEEK', position: nextPosition });
  };

  const getPositionFromPageX = (pageX: number) => {
    if (progressBarWidth === 0 || playerDuration === 0) return playerPosition;
    const relativeX = pageX - progressBarPageX;
    const clampedX = Math.max(0, Math.min(progressBarWidth, relativeX));
    const ratio = clampedX / progressBarWidth;
    return Math.floor(playerDuration * ratio);
  };

  const lastSeekTimestamp = useRef(0);

  const handleDragMove = async (pageX: number) => {
    if (progressBarWidth === 0 || playerDuration === 0) return;
    if (!Number.isFinite(pageX)) return;
    const nextPosition = getPositionFromPageX(pageX);
    setDragPosition(nextPosition);

    const now = Date.now();
    if (now - lastSeekTimestamp.current > 50) {
      lastSeekTimestamp.current = now;
      await seekToPosition(nextPosition);
    }
  };

  const progressPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: async (event) => {
      if (progressBarWidth === 0 || playerDuration === 0) return;
      const { pageX } = event.nativeEvent;
      if (!Number.isFinite(pageX)) return;
      setIsDraggingProgress(true);
      const newPosition = getPositionFromPageX(pageX);
      setDragPosition(newPosition);
      await seekToPosition(newPosition);
    },
    onPanResponderMove: async (event) => {
      await handleDragMove(event.nativeEvent.pageX);
    },
    onPanResponderRelease: async (event) => {
      await handleDragMove(event.nativeEvent.pageX);
      setIsDraggingProgress(false);
    },
    onPanResponderTerminate: () => {
      setIsDraggingProgress(false);
    },
  }), [progressBarWidth, playerDuration, progressBarPageX, playerPosition]);

  // 下载管理
  const handleDownload = async (track: QueuedTrack) => {
    if (downloadingTracks.has(track.id)) return;
    
    setDownloadingTracks(prev => new Set(prev).add(track.id));
    
    try {
      const videoResult = await getVideoInfo(track.bvid);
      if (!videoResult.success || !videoResult.video) {
        showToast.error('获取视频信息失败', videoResult.error || '未知错误');
        return;
      }
      
      const video = videoResult.video;
      let cid = video.cid;
      if (video.pages.length > 0) {
        cid = video.pages[Math.min(track.page - 1, video.pages.length - 1)].cid;
      }
      
      const audioResult = await getAudioUrl(cid, video.bvid);
      if (!audioResult.success || !audioResult.url) {
        showToast.error('获取音频失败', audioResult.error || '未知错误');
        return;
      }
      
      const downloadResult = await downloadToPermanentStorage(audioResult.url, `audio_${video.bvid}_${cid}`);
      
      if (downloadResult.success) {
        markTrackDownloaded(track.id);
        showToast.success('下载完成', '歌曲已保存到本地');
      } else {
        showToast.error('下载失败', downloadResult.error || '无法下载音频');
      }
    } catch (error) {
      showToast.error('下载失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setDownloadingTracks(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const handleDeleteDownload = (track: QueuedTrack) => {
    Alert.alert(
      '确认删除',
      `确定要删除 "${track.title || track.bvid}" 的本地文件吗？`,
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '删除', 
          style: 'destructive',
          onPress: async () => {
            const success = await deletePermanentAudio(`audio_${track.bvid}_${track.page}`);
            if (success) {
              markTrackNotDownloaded(track.id);
              showToast.success('已删除', '本地文件已删除');
            }
          }
        }
      ]
    );
  };

  // 格式化时间
  const formatTime = (millis: number) => {
    const secs = Math.floor(millis / 1000);
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const getRepeatModeIconName = () => {
    switch (repeatMode) {
      case 'shuffle': return 'shuffle';
      case 'off':
      case 'all':
      case 'one':
      default:
        return 'repeat';
    }
  };

  // 迷你播放器
  const renderMiniPlayer = () => {
    if (!currentTrack) return null;
    
    return (
      <View style={styles.miniPlayerContainer}>
        <TouchableOpacity 
          style={styles.miniPlayer}
          onPress={() => setIsFullPlayerVisible(true)}
          activeOpacity={0.9}
        >
          <View style={[styles.miniPlayerArtwork, !videoInfo?.artwork && styles.miniPlayerArtworkPlaceholder]}>
            {videoInfo?.artwork ? (
              <Image source={{ uri: videoInfo.artwork }} style={styles.miniPlayerArtworkImage} resizeMode="cover" />
            ) : (
              <Feather name="music" size={20} color={isDark ? '#F9FAFB' : '#6B7280'} />
            )}
          </View>
          <View style={styles.miniPlayerInfo}>
            <ScrollingText
              text={currentTrack.title || currentTrack.bvid}
              textStyle={styles.miniPlayerTitle}
              containerStyle={styles.miniPlayerMarquee}
            />
            <ScrollingText
              text={currentTrack.author || '未知UP主'}
              textStyle={styles.miniPlayerArtist}
              containerStyle={styles.miniPlayerMarquee}
            />
          </View>
          <TouchableOpacity 
            style={styles.miniPlayerButton}
            onPress={(e) => { e.stopPropagation(); handleTogglePlay(); }}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Feather
                name={isPlaying ? 'pause' : 'play'}
                size={20}
                color="#FFFFFF"
                style={!isPlaying ? styles.playIconOffset : undefined}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  };

  // 完整播放器
  const renderFullPlayer = () => {
    if (!currentTrack) return null;

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isFullPlayerVisible}
        onRequestClose={() => setIsFullPlayerVisible(false)}
      >
        <View style={styles.fullPlayerOverlay}>
          <View style={styles.fullPlayerContainer}>
            {videoInfo?.artwork && (
              <Image
                source={{ uri: videoInfo.artwork }}
                style={styles.fullPlayerBackground}
                blurRadius={30}
                resizeMode="cover"
              />
            )}
            <View style={styles.fullPlayerBackgroundOverlay} />
            
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setIsFullPlayerVisible(false)}
            >
              <Feather name="x" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.fullPlayerContent}>
              <View style={[styles.fullPlayerArtwork, !videoInfo?.artwork && styles.fullPlayerArtworkPlaceholder]}>
                {videoInfo?.artwork ? (
                  <Image source={{ uri: videoInfo.artwork }} style={styles.fullPlayerArtworkImage} resizeMode="cover" />
                ) : (
                  <Feather name="music" size={80} color="#9CA3AF" />
                )}
              </View>

              <View style={styles.fullPlayerInfo}>
                <Text style={styles.fullPlayerTitle} numberOfLines={2}>
                  {currentTrack.title || currentTrack.bvid}
                </Text>
                <Text style={styles.fullPlayerArtist}>
                  {currentTrack.author || '未知UP主'}
                </Text>
              </View>

              <View style={styles.fullPlayerProgressContainer}>
                <View
                  ref={progressBarRef}
                  style={styles.fullPlayerProgressBar}
                  onLayout={(event: { nativeEvent: { layout: { width: number } } }) => {
                    setProgressBarWidth(event.nativeEvent.layout.width);
                    progressBarRef.current?.measureInWindow((x) => {
                      setProgressBarPageX(x);
                    });
                  }}
                  {...progressPanResponder.panHandlers}
                >
                  <View style={styles.fullPlayerProgressTrack} />
                  <View
                    style={[
                      styles.fullPlayerProgressFill,
                      { width: `${((isDraggingProgress ? dragPosition : playerPosition) / playerDuration) * 100 || 0}%` },
                    ]}
                  />
                  <View
                    style={[
                      styles.fullPlayerProgressThumb,
                      {
                        left: `${((isDraggingProgress ? dragPosition : playerPosition) / playerDuration) * 100 || 0}%`,
                        transform: [
                          { translateX: -8 },
                          { scale: isDraggingProgress ? 1.4 : 1 },
                        ],
                      },
                    ]}
                  />
                </View>
                <View style={styles.fullPlayerTimeRow}>
                  <Text style={styles.fullPlayerTimeText}>{formatTime(isDraggingProgress ? dragPosition : playerPosition)}</Text>
                  <Text style={styles.fullPlayerTimeText}>{formatTime(playerDuration)}</Text>
                </View>
              </View>

              <View style={styles.fullPlayerControls}>
                <TouchableOpacity 
                  style={[styles.fullPlayerControlButton, (!hasPreviousTrack || isLoading || isRestoring) && styles.buttonDisabled]}
                  onPress={handlePreviousTrack}
                  disabled={!hasPreviousTrack || isLoading || isRestoring}
                >
                  <Feather name="skip-back" size={28} color="#FFFFFF" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.fullPlayerPlayButton, (isLoading || isRestoring) && styles.buttonDisabled]}
                  onPress={handleTogglePlay}
                  disabled={isLoading || isRestoring}
                >
                  {isRestoring ? (
                    <ActivityIndicator size="large" color="#FFFFFF" />
                  ) : (
                    <Feather
                      name={isPlaying ? 'pause' : 'play'}
                      size={48}
                      color="#FFFFFF"
                      style={!isPlaying ? styles.playIconOffset : undefined}
                    />
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.fullPlayerControlButton, (!hasNextTrack || isLoading || isRestoring) && styles.buttonDisabled]}
                  onPress={() => handleNextTrack()}
                  disabled={!hasNextTrack || isLoading || isRestoring}
                >
                  <Feather name="skip-forward" size={28} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.bottomControlsContainer}>
                <TouchableOpacity 
                  style={styles.repeatModeButton}
                  onPress={toggleRepeatMode}
                >
                  <View style={styles.repeatModeIconWrapper}>
                    <Feather
                      name={getRepeatModeIconName()}
                      size={20}
                      color={repeatMode === 'off' ? '#9CA3AF' : '#FFFFFF'}
                    />
                    {repeatMode === 'one' && (
                      <View style={styles.repeatBadge}>
                        <Text style={styles.repeatBadgeText}>1</Text>
                      </View>
                    )}
                    {repeatMode === 'off' && <View style={styles.repeatOffSlash} />}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const tabBarHeight = 68;
  const miniPlayerGap = 0;
  const miniPlayerBottomOffset = tabBarHeight + miniPlayerGap + insets.bottom;
  const contentBottomPadding = 100 + tabBarHeight + miniPlayerGap + insets.bottom;

  const miniPlayer = renderMiniPlayer();

  return (
    <SafeAreaView style={styles.container}>
      {/* 网络状态提示 */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineBannerContent}>
              <Feather name="alert-triangle" size={14} color="#FFFFFF" />
              <Text style={styles.offlineBannerText}>离线模式 - 仅可播放已下载歌曲</Text>
            </View>
          </View>
        )}
      
      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }] }>
        <Text style={styles.title}>播放列表</Text>
        
        {queue.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>播放列表为空</Text>
            <Text style={styles.hint}>请先在解析页面添加音轨</Text>
          </View>
        ) : (
          <View style={styles.list}>
            <Text style={styles.listTitle}>队列 ({queue.length}) {isOnline ? '' : '- 仅显示可播放'}</Text>
            {queue.map((track, index) => (
              <QueueItem
                key={track.id}
                track={track}
                index={index}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying}
                isLoading={isLoading && currentTrack?.id === track.id}
                downloadStatus={downloadedTracks.has(track.id) ? 'downloaded' : downloadingTracks.has(track.id) ? 'downloading' : 'none'}
                isOffline={!isOnline}
                onPlay={() => loadTrack(track)}
                onDownload={() => handleDownload(track)}
                onDelete={() => handleDeleteDownload(track)}
                onRemove={() => removeTrack(track.id)}
                isDark={isDark}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {miniPlayer && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: miniPlayerBottomOffset }}>
          {miniPlayer}
        </View>
      )}
      {renderFullPlayer()}
    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? '#1F2937' : '#F3F4F6' },
  offlineBanner: { backgroundColor: '#F59E0B', padding: 8, alignItems: 'center' },
  offlineBannerContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offlineBannerText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 16 },
  
  // 队列项
  trackCard: { backgroundColor: isDark ? '#374151' : '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  trackCardActive: { borderColor: '#3B82F6', borderWidth: 2 },
  trackCardOffline: { opacity: 0.6 },
  trackInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  trackIndex: { fontSize: 18, fontWeight: '600', color: '#3B82F6', width: 30 },
  trackDetail: { flex: 1 },
  trackTitle: { fontSize: 16, fontWeight: '500', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 2 },
  trackAuthor: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 2 },
  trackPage: { fontSize: 12, color: '#9CA3AF' },
  textOffline: { color: '#9CA3AF' },
  trackActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  
  // 图标按钮
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#4B5563' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  iconButtonDownloaded: { backgroundColor: '#D1FAE5' },
  iconButtonLoading: { backgroundColor: '#DBEAFE' },
  
  // 播放按钮
  playButton: { flex: 1, backgroundColor: '#3B82F6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  playingButton: { backgroundColor: '#10B981' },
  buttonOffline: { backgroundColor: '#9CA3AF' },
  playButtonText: { color: '#FFFFFF', fontWeight: '600' },
  
  // 删除按钮
  deleteButton: { backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  deleteButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 12 },
  
  // 通用
  buttonDisabled: { opacity: 0.6 },
  emptyCard: { backgroundColor: isDark ? '#374151' : '#FFFFFF', borderRadius: 12, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  emptyText: { fontSize: 18, color: '#9CA3AF', marginBottom: 8 },
  hint: { color: isDark ? '#9CA3AF' : '#6B7280' },
  list: { gap: 12 },
  listTitle: { fontSize: 16, fontWeight: '600', color: isDark ? '#9CA3AF' : '#374151', marginBottom: 8 },
  
  // 迷你播放器
  miniPlayerContainer: { paddingHorizontal: 20, paddingBottom: 0, paddingTop: 8, backgroundColor: 'transparent' },
  miniPlayer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#FFFFFF', borderRadius: 32, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10 },
  miniPlayerArtwork: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  miniPlayerArtworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  miniPlayerArtworkImage: { width: 40, height: 40 },
  miniPlayerInfo: { flex: 1, marginHorizontal: 12, overflow: 'hidden' },
  miniPlayerMarquee: { width: '100%' },
  miniPlayerTitle: { fontSize: 14, color: isDark ? '#F9FAFB' : '#111827', fontWeight: '600' },
  miniPlayerArtist: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 2 },
  miniPlayerButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  
  // 完整播放器
  fullPlayerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  fullPlayerContainer: { height: '100%', backgroundColor: '#000000', overflow: 'hidden' },
  fullPlayerBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.6 },
  fullPlayerBackgroundOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.2)', alignItems: 'center', justifyContent: 'center' },
  fullPlayerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fullPlayerArtwork: { width: 280, height: 280, borderRadius: 16, backgroundColor: '#374151', marginBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10, overflow: 'hidden' },
  fullPlayerArtworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  fullPlayerArtworkImage: { width: 280, height: 280 },
  fullPlayerInfo: { alignItems: 'center', marginBottom: 40, width: '100%' },
  fullPlayerTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  fullPlayerArtist: { fontSize: 16, color: '#9CA3AF', textAlign: 'center' },
  fullPlayerProgressContainer: { width: '100%', marginBottom: 40 },
  fullPlayerProgressBar: { height: 6, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 3, overflow: 'visible' },
  fullPlayerProgressTrack: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  fullPlayerProgressFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 3 },
  fullPlayerProgressThumb: { position: 'absolute', top: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#3B82F6' },
  fullPlayerTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  fullPlayerTimeText: { fontSize: 13, color: '#9CA3AF' },
  fullPlayerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fullPlayerPlayButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  fullPlayerControlButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255, 255, 255, 0.2)', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16 },
  bottomControlsContainer: { flexDirection: 'row', justifyContent: 'center', width: '100%', paddingHorizontal: 40, marginTop: 20 },
  repeatModeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.15)', alignItems: 'center', justifyContent: 'center' },
  playIconOffset: { transform: [{ translateX: 2 }] },
  repeatModeIconWrapper: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  repeatBadge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: '#FFFFFF', borderRadius: 6, paddingHorizontal: 2 },
  repeatBadgeText: { fontSize: 9, color: '#111827', fontWeight: '700' },
  repeatOffSlash: { position: 'absolute', width: 18, height: 2, backgroundColor: '#9CA3AF', transform: [{ rotate: '-45deg' }] },
});
