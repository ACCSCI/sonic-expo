import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Pressable, Modal, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayer, QueuedTrack } from '../../src/context/PlayerContext';
import { getVideoInfo, getAudioUrl } from '../../src/services/bilibili';
import { setupPlayer, loadAndPlay, play, pause, unload, seekTo, getCurrentTrackId } from '../../src/services/player';
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
    const duration = (distance / 50) * 1000; // 50 pixels per second

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
    // Wait a bit for layout to be calculated
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
  const { queue, removeTrack, setCurrentTrack } = usePlayer();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ title: string; author: string; artwork: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState({ position: 0, duration: 0 });
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addDebugLog = (log: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, `[${timestamp}] ${log}`]);
  };

  useEffect(() => {
    const initPlayer = async () => {
      try {
        const success = await setupPlayer();
        setIsPlayerReady(success);
      } catch (error) {
        console.error('Player init error:', error);
      }
    };
    initPlayer();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      unload();
    };
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const status = await getStatus();
        if (status) {
          setProgress({ position: status.position, duration: status.duration });
          setIsPlaying(status.isPlaying);
        }
      } catch {
        // ignore
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getStatus = async () => {
    try {
      const playerService = await import('../../src/services/player');
      return await playerService.getStatus();
    } catch {
      return null;
    }
  };

  const handlePlay = async (track: QueuedTrack) => {
    if (!isPlayerReady) return;
    
    const currentTrackId = getCurrentTrackId();
    
    // 如果正在加载这首歌，忽略重复点击
    if (isLoading === track.id) return;
    
    // 情况1: 点击正在播放或暂停的歌曲 -> 暂停/继续
    if (currentTrackId === track.id && videoInfo) {
      try {
        if (isPlaying) {
          await pause();
          setIsPlaying(false);
        } else {
          await play();
          setIsPlaying(true);
        }
      } catch (error) {
        console.error('Toggle play error:', error);
      }
      return;
    }
    
    // 情况2: 切换歌曲 - 先设置加载状态，然后加载新歌曲
    // player.ts 中的 loadAndPlay 会自动处理旧播放器的清理和互斥
    setIsLoading(track.id);
    setCurrentTrack(track);
    setVideoInfo(null);
    setIsPlaying(false);
    setProgress({ position: 0, duration: 0 });
    setDebugLogs([]);

    try {
      addDebugLog(`开始获取视频信息...`);
      addDebugLog(`bvid: ${track.bvid}`);
      
      // 优先使用 API 获取完整信息（包含 CID）
      const videoResult = await getVideoInfo(track.bvid);
      
      addDebugLog(`获取结果: ${videoResult.success ? '成功' : '失败'}`);
      if (videoResult.video) {
        addDebugLog(`标题: ${videoResult.video.title}`);
        addDebugLog(`CID: ${videoResult.video.cid}`);
      }
      
      if (!videoResult.success || !videoResult.video) {
        showToast.error('获取视频信息失败', videoResult.error || '未知错误');
        setIsLoading(null);
        return;
      }

      const video = videoResult.video;
      
      setVideoInfo({
        title: video.title,
        author: video.author,
        artwork: video.pic,
      });
      
      let cid = video.cid;
      if (video.pages.length > 0) {
        const partIndex = Math.min(track.page - 1, video.pages.length - 1);
        cid = video.pages[partIndex].cid;
        addDebugLog(`使用分P CID: ${cid}`);
      }

      addDebugLog(`获取音频 URL...`);
      const audioResult = await getAudioUrl(cid, video.bvid);
      
      if (!audioResult.success || !audioResult.url) {
        showToast.error('获取音频失败', audioResult.error || '未知错误');
        setIsLoading(null);
        return;
      }

      // 下载音频到本地
      addDebugLog(`开始下载音频...`);
      const downloadResult = await downloadAudioToFile(audioResult.url, `audio_${video.bvid}_${cid}`);
      
      if (!downloadResult.success || !downloadResult.localPath) {
        addDebugLog(`下载失败: ${downloadResult.error}`);
        showToast.error('下载失败', downloadResult.error || '无法下载音频');
        setIsLoading(null);
        return;
      }
      
      addDebugLog(`下载完成, 路径: ${downloadResult.localPath}`);

      // 加载并播放 - player.ts 会处理互斥和旧播放器清理
      const loadResult = await loadAndPlay({
        id: track.id,
        url: downloadResult.localPath,
        title: video.title,
        artist: video.author,
        artwork: video.pic,
        duration: video.duration,
      }, (status) => {
        setProgress({ position: status.position, duration: status.duration });
        setIsPlaying(status.isPlaying);
      });

      if (!loadResult.success) {
        addDebugLog(`播放失败: ${loadResult.error}`);
        
        // 如果是文件损坏，尝试删除缓存并重新下载
        if (loadResult.isCorrupted) {
          addDebugLog('检测到文件损坏，尝试重新下载...');
          showToast.info('缓存文件损坏', '正在重新下载...');
          
          // 删除损坏的缓存
          await deleteLocalAudio(`audio_${video.bvid}_${cid}`);
          
          // 强制重新下载
          const retryDownload = await downloadAudioToFile(
            audioResult.url, 
            `audio_${video.bvid}_${cid}`,
            undefined,
            true // 强制重新下载
          );
          
          if (!retryDownload.success || !retryDownload.localPath) {
            showToast.error('重新下载失败', retryDownload.error || '无法重新下载音频');
            setIsLoading(null);
            return;
          }
          
          addDebugLog(`重新下载完成，再次尝试播放...`);
          
          // 再次尝试播放
          const retryResult = await loadAndPlay({
            id: track.id,
            url: retryDownload.localPath,
            title: video.title,
            artist: video.author,
            artwork: video.pic,
            duration: video.duration,
          }, (status) => {
            setProgress({ position: status.position, duration: status.duration });
            setIsPlaying(status.isPlaying);
          });
          
          if (!retryResult.success) {
            showToast.error('播放失败', retryResult.error || '无法加载音频，请稍后重试');
            // 第二次失败也删除缓存
            await deleteLocalAudio(`audio_${video.bvid}_${cid}`);
          } else {
            showToast.success('播放成功', '缓存已修复');
          }
        } else {
          showToast.error('播放失败', loadResult.error || '无法加载音频');
        }
      } else {
        showToast.success('开始播放', video.title);
      }
      
    } catch (error) {
      showToast.error('播放失败', error instanceof Error ? error.message : '播放失败');
    } finally {
      setIsLoading(null);
    }
  };

  const handleTogglePlay = async () => {
    const currentTrackId = getCurrentTrackId();
    if (!currentTrackId) return;
    
    try {
      if (isPlaying) {
        await pause();
        setIsPlaying(false);
      } else {
        await play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Toggle play error:', error);
    }
  };

  const handleSeek = async (event: any) => {
    if (progress.duration === 0 || !getCurrentTrackId()) return;
    
    try {
      const { locationX } = event.nativeEvent;
      const ratio = Math.max(0, Math.min(1, locationX / progressBarWidth));
      const newPosition = Math.floor(progress.duration * ratio);
      
      await seekTo(newPosition);
      setProgress(prev => ({ ...prev, position: newPosition }));
    } catch (error) {
      console.error('Seek error:', error);
    }
  };

  const formatTime = (millis: number) => {
    const secs = Math.floor(millis / 1000);
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // 底部迷你播放器
  const renderMiniPlayer = () => {
    if (!getCurrentTrackId() || !videoInfo) return null;
    
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

  // 完整播放器 Modal
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
            {/* 背景模糊图片 */}
            <Image
              source={{ uri: videoInfo.artwork }}
              style={styles.fullPlayerBackground}
              blurRadius={30}
              resizeMode="cover"
            />
            <View style={styles.fullPlayerBackgroundOverlay} />
            
            {/* 关闭按钮 */}
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setIsFullPlayerVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            {/* 内容区域 */}
            <View style={styles.fullPlayerContent}>
              {/* 封面 */}
              <Image
                source={{ uri: videoInfo.artwork }}
                style={styles.fullPlayerArtwork}
                resizeMode="cover"
              />

              {/* 歌曲信息 */}
              <View style={styles.fullPlayerInfo}>
                <Text style={styles.fullPlayerTitle} numberOfLines={2}>
                  {videoInfo.title}
                </Text>
                <Text style={styles.fullPlayerArtist}>
                  {videoInfo.author}
                </Text>
              </View>

              {/* 进度条 */}
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
                      { width: `${(progress.position / progress.duration) * 100 || 0}%` }
                    ]} 
                  />
                </Pressable>
                <View style={styles.fullPlayerTimeRow}>
                  <Text style={styles.fullPlayerTimeText}>{formatTime(progress.position)}</Text>
                  <Text style={styles.fullPlayerTimeText}>{formatTime(progress.duration)}</Text>
                </View>
              </View>

              {/* 播放控制 */}
              <View style={styles.fullPlayerControls}>
                <TouchableOpacity 
                  style={styles.fullPlayerPlayButton}
                  onPress={handleTogglePlay}
                >
                  <Text style={styles.fullPlayerPlayButtonText}>
                    {isPlaying ? '⏸' : '▶'}
                  </Text>
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
                      (isLoading === track.id || !isPlayerReady) && styles.buttonDisabled,
                      getCurrentTrackId() === track.id && isPlaying && styles.playingButton
                    ]}
                    onPress={() => handlePlay(track)}
                    disabled={!!isLoading || !isPlayerReady}
                  >
                    {isLoading === track.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.playButtonText}>
                        {getCurrentTrackId() === track.id && isPlaying ? '播放中' : 
                         getCurrentTrackId() === track.id && !isPlaying ? '继续' : '播放'}
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

      {/* 底部迷你播放器 */}
      {renderMiniPlayer()}

      {/* 完整播放器 Modal */}
      {renderFullPlayer()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  
  // 迷你播放器样式
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
  
  // 完整播放器样式
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
  
  // 其他样式保持不变
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
