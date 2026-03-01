import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Pressable, Modal, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayer, QueuedTrack } from '../../src/context/PlayerContext';
import { getVideoInfo, getAudioUrl } from '../../src/services/bilibili';
import { playerStore, Track } from '../../src/services/PlayerStore';
import { downloadAudioToFile, deleteLocalAudio } from '../../src/services/download';
import { showToast } from '../../src/components/ToastConfig';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 可滚动文字组件
function ScrollingText({ text, style }: { text: string; style: any }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const containerWidth = useRef(0);
  const textWidth = useRef(0);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const startAnimation = useCallback(() => {
    if (textWidth.current <= containerWidth.current) {
      translateX.setValue(0);
      return;
    }

    const distance = textWidth.current - containerWidth.current + 20;
    const duration = (distance / 50) * 1000;

    animationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: -distance,
          duration,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
        Animated.timing(translateX, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
      ])
    );

    animationRef.current.start();
  }, [translateX]);

  useEffect(() => {
    const timer = setTimeout(startAnimation, 500);
    return () => {
      clearTimeout(timer);
      animationRef.current?.stop();
    };
  }, [startAnimation, text]);

  return (
    <View 
      style={style}
      onLayout={(e) => {
        containerWidth.current = e.nativeEvent.layout.width;
        startAnimation();
      }}
    >
      <Animated.View
        style={{ transform: [{ translateX }] }}
        onLayout={(e) => {
          textWidth.current = e.nativeEvent.layout.width;
          startAnimation();
        }}
      >
        <Text style={style} numberOfLines={1}>{text}</Text>
      </Animated.View>
    </View>
  );
}

export default function PlayerScreen() {
  // 从 Context 获取队列和播放器状态
  const { 
    queue, removeTrack, currentTrack, setCurrentTrack,
    hasNextTrack, hasPreviousTrack, skipToNext, playPreviousTrack,
    repeatMode, toggleRepeatMode,
    playerState, playerPosition, playerDuration, isPlaying
  } = usePlayer();
  
  // 本地状态
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ title: string; author: string; artwork: string } | null>(null);
  const [currentAudioPath, setCurrentAudioPath] = useState<string | null>(null);
  const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  
  // Refs
  const isInitialized = useRef(false);

  const addDebugLog = (log: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-49), `[${timestamp}] ${log}`]);
  };

  // 初始化播放器
  useEffect(() => {
    const init = async () => {
      const success = await playerStore.initialize();
      isInitialized.current = success;
      if (!success) {
        showToast.error('初始化失败', '无法初始化音频播放器');
      }
    };
    init();
  }, []);

  // 监听 currentTrack 变化，自动加载新歌曲
  useEffect(() => {
    if (!currentTrack || !isInitialized.current) return;
    
    // 触发加载
    loadTrack(currentTrack);
  }, [currentTrack?.id]);

  // 加载歌曲
  const loadTrack = async (track: QueuedTrack) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setVideoInfo(null);
    addDebugLog(`开始加载: ${track.bvid}`);

    try {
      // 获取视频信息
      const videoResult = await getVideoInfo(track.bvid);
      if (!videoResult.success || !videoResult.video) {
        showToast.error('获取视频信息失败', videoResult.error || '未知错误');
        setIsLoading(false);
        return;
      }

      const video = videoResult.video;
      setVideoInfo({
        title: video.title,
        author: video.author,
        artwork: video.pic,
      });

      // 获取 CID
      let cid = video.cid;
      if (video.pages.length > 0) {
        const partIndex = Math.min(track.page - 1, video.pages.length - 1);
        cid = video.pages[partIndex].cid;
      }

      // 获取音频 URL
      const audioResult = await getAudioUrl(cid, video.bvid);
      if (!audioResult.success || !audioResult.url) {
        showToast.error('获取音频失败', audioResult.error || '未知错误');
        setIsLoading(false);
        return;
      }

      // 下载音频
      addDebugLog('下载音频中...');
      const downloadResult = await downloadAudioToFile(audioResult.url, `audio_${video.bvid}_${cid}`);
      
      if (!downloadResult.success || !downloadResult.localPath) {
        showToast.error('下载失败', downloadResult.error || '无法下载音频');
        setIsLoading(false);
        return;
      }

      setCurrentAudioPath(downloadResult.localPath);
      addDebugLog(`下载完成: ${downloadResult.localPath}`);

      // 加载到播放器
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
      
    } catch (error) {
      console.error('Load track error:', error);
      showToast.error('加载失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  // 播放控制
  const handleTogglePlay = async () => {
    if (playerState === 'playing') {
      await playerStore.dispatch({ type: 'PAUSE' });
    } else {
      await playerStore.dispatch({ type: 'PLAY' });
    }
  };

  const handleNextTrack = async () => {
    if (!hasNextTrack) return;
    const nextTrack = skipToNext();
    if (nextTrack) {
      setCurrentTrack(nextTrack);
    }
  };

  const handlePreviousTrack = async () => {
    if (!hasPreviousTrack) return;
    const prevTrack = playPreviousTrack();
    if (prevTrack) {
      setCurrentTrack(prevTrack);
    }
  };

  const handleSeek = async (event: any) => {
    if (playerDuration === 0) return;
    
    const { locationX } = event.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const newPosition = Math.floor(playerDuration * ratio);
    
    await playerStore.dispatch({ type: 'SEEK', position: newPosition });
  };

  // 从列表播放指定歌曲
  const handlePlayFromList = (track: QueuedTrack) => {
    setCurrentTrack(track);
  };

  // 格式化时间
  const formatTime = (millis: number) => {
    const secs = Math.floor(millis / 1000);
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // 获取循环模式图标
  const getRepeatModeIcon = () => {
    switch (repeatMode) {
      case 'off': return '➡️';
      case 'all': return '🔁';
      case 'one': return '🔂';
      case 'shuffle': return '🔀';
      default: return '➡️';
    }
  };

  // 迷你播放器
  const renderMiniPlayer = () => {
    if (!currentTrack || !videoInfo) return null;
    
    return (
      <View style={styles.miniPlayerContainer}>
        <TouchableOpacity 
          style={styles.miniPlayer}
          onPress={() => setIsFullPlayerVisible(true)}
          activeOpacity={0.9}
        >
          <Image
            source={{ uri: videoInfo.artwork }}
            style={styles.miniPlayerArtwork}
            resizeMode="cover"
          />
          <View style={styles.miniPlayerInfo}>
            <ScrollingText 
              text={`${videoInfo.title} - ${videoInfo.author}`}
              style={styles.miniPlayerText}
            />
          </View>
          <TouchableOpacity 
            style={styles.miniPlayerButton}
            onPress={(e) => {
              e.stopPropagation();
              handleTogglePlay();
            }}
          >
            <Text style={styles.miniPlayerButtonText}>
              {isPlaying ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  };

  // 完整播放器
  const renderFullPlayer = () => {
    if (!videoInfo) return null;

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isFullPlayerVisible}
        onRequestClose={() => setIsFullPlayerVisible(false)}
      >
        <View style={styles.fullPlayerOverlay}>
          <View style={styles.fullPlayerContainer}>
            <Image
              source={{ uri: videoInfo.artwork }}
              style={styles.fullPlayerBackground}
              blurRadius={30}
              resizeMode="cover"
            />
            <View style={styles.fullPlayerBackgroundOverlay} />
            
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setIsFullPlayerVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.fullPlayerContent}>
              <Image
                source={{ uri: videoInfo.artwork }}
                style={styles.fullPlayerArtwork}
                resizeMode="cover"
              />

              <View style={styles.fullPlayerInfo}>
                <Text style={styles.fullPlayerTitle} numberOfLines={2}>
                  {videoInfo.title}
                </Text>
                <Text style={styles.fullPlayerArtist}>
                  {videoInfo.author}
                </Text>
              </View>

              <View style={styles.fullPlayerProgressContainer}>
                <Pressable 
                  style={styles.fullPlayerProgressBar}
                  onPress={handleSeek}
                  onLayout={(event) => setProgressBarWidth(event.nativeEvent.layout.width)}
                >
                  <View style={styles.fullPlayerProgressTrack} />
                  <View 
                    style={[
                      styles.fullPlayerProgressFill, 
                      { width: `${(playerPosition / playerDuration) * 100 || 0}%` }
                    ]} 
                  />
                </Pressable>
                <View style={styles.fullPlayerTimeRow}>
                  <Text style={styles.fullPlayerTimeText}>{formatTime(playerPosition)}</Text>
                  <Text style={styles.fullPlayerTimeText}>{formatTime(playerDuration)}</Text>
                </View>
              </View>

              <View style={styles.fullPlayerControls}>
                <TouchableOpacity 
                  style={[styles.fullPlayerControlButton, !hasPreviousTrack && styles.buttonDisabled]}
                  onPress={handlePreviousTrack}
                  disabled={!hasPreviousTrack}
                >
                  <Text style={styles.fullPlayerControlButtonText}>⏮</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.fullPlayerPlayButton}
                  onPress={handleTogglePlay}
                >
                  <Text style={styles.fullPlayerPlayButtonText}>
                    {isPlaying ? '⏸' : '▶'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.fullPlayerControlButton, !hasNextTrack && styles.buttonDisabled]}
                  onPress={handleNextTrack}
                  disabled={!hasNextTrack}
                >
                  <Text style={styles.fullPlayerControlButtonText}>⏭</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.repeatModeContainer}>
                <TouchableOpacity 
                  style={styles.repeatModeButton}
                  onPress={toggleRepeatMode}
                >
                  <Text style={styles.repeatModeIcon}>{getRepeatModeIcon()}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>播放列表</Text>

        {debugLogs.length > 0 && (
          <View style={styles.debugCard}>
            <Text style={styles.debugTitle}>调试日志</Text>
            <ScrollView style={styles.debugScroll} nestedScrollEnabled>
              {debugLogs.map((log, index) => (
                <Text key={index} style={styles.debugText}>{log}</Text>
              ))}
            </ScrollView>
          </View>
        )}
        
        {queue.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>播放列表为空</Text>
            <Text style={styles.hint}>请先在解析页面添加音轨</Text>
          </View>
        ) : (
          <View style={styles.list}>
            <Text style={styles.listTitle}>队列 ({queue.length})</Text>
            {queue.map((track, index) => (
              <View key={track.id} style={styles.trackCard}>
                <View style={styles.trackInfo}>
                  <Text style={styles.trackIndex}>{index + 1}</Text>
                  <View style={styles.trackDetail}>
                    <Text style={styles.trackTitle} numberOfLines={2}>
                      {track.title || track.bvid}
                    </Text>
                    <Text style={styles.trackAuthor} numberOfLines={1}>
                      {track.author || '未知UP主'}
                    </Text>
                    <Text style={styles.trackPage}>分P: {track.page}</Text>
                  </View>
                </View>
                <View style={styles.trackActions}>
                  <TouchableOpacity
                    style={[
                      styles.playButton, 
                      (isLoading && currentTrack?.id === track.id) && styles.buttonDisabled,
                      currentTrack?.id === track.id && isPlaying && styles.playingButton
                    ]}
                    onPress={() => handlePlayFromList(track)}
                    disabled={isLoading && currentTrack?.id === track.id}
                  >
                    {isLoading && currentTrack?.id === track.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.playButtonText}>
                        {currentTrack?.id === track.id && isPlaying ? '播放中' : 
                         currentTrack?.id === track.id && !isPlaying ? '继续' : '播放'}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => removeTrack(track.id)}
                  >
                    <Text style={styles.deleteButtonText}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {renderMiniPlayer()}
      {renderFullPlayer()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  
  // 迷你播放器
  miniPlayerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  miniPlayerArtwork: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  miniPlayerInfo: {
    flex: 1,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  miniPlayerText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  miniPlayerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayerButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  
  // 完整播放器
  fullPlayerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  fullPlayerContainer: {
    height: '100%',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  fullPlayerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.6,
  },
  fullPlayerBackgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  fullPlayerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fullPlayerArtwork: {
    width: 280,
    height: 280,
    borderRadius: 16,
    backgroundColor: '#374151',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  fullPlayerInfo: {
    alignItems: 'center',
    marginBottom: 40,
    width: '100%',
  },
  fullPlayerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  fullPlayerArtist: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  fullPlayerProgressContainer: {
    width: '100%',
    marginBottom: 40,
  },
  fullPlayerProgressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fullPlayerProgressTrack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  fullPlayerProgressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 3,
  },
  fullPlayerTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  fullPlayerTimeText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  fullPlayerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPlayerPlayButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  fullPlayerPlayButtonText: {
    fontSize: 36,
    color: '#FFFFFF',
  },
  fullPlayerControlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
  },
  fullPlayerControlButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  repeatModeContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    width: '100%',
    paddingHorizontal: 40,
    marginTop: 20,
  },
  repeatModeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatModeIcon: {
    fontSize: 20,
  },
  
  // 列表样式
  buttonDisabled: { opacity: 0.6 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  emptyText: { fontSize: 18, color: '#9CA3AF', marginBottom: 8 },
  hint: { color: '#6B7280' },
  list: { gap: 12 },
  listTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
  trackCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  trackInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  trackIndex: { fontSize: 18, fontWeight: '600', color: '#3B82F6', width: 30 },
  trackDetail: { flex: 1 },
  trackTitle: { fontSize: 16, fontWeight: '500', color: '#111827', marginBottom: 2 },
  trackAuthor: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  trackPage: { fontSize: 12, color: '#9CA3AF' },
  trackActions: { flexDirection: 'row', gap: 8 },
  playButton: { flex: 1, backgroundColor: '#3B82F6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  playingButton: { backgroundColor: '#10B981' },
  playButtonText: { color: '#FFFFFF', fontWeight: '600' },
  deleteButton: { backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  deleteButtonText: { color: '#FFFFFF', fontWeight: '600' },
  debugCard: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F59E0B' },
  debugTitle: { fontSize: 14, fontWeight: '600', color: '#92400E', marginBottom: 8 },
  debugScroll: { maxHeight: 150, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8 },
  debugText: { fontSize: 11, color: '#374151', marginBottom: 2 },
});
