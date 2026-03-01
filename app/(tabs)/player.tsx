import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayer, QueuedTrack } from '../../src/context/PlayerContext';
import { getVideoInfo, getAudioUrl, getVideoInfoFromUrl } from '../../src/services/bilibili';
import { setupPlayer, loadAndPlay, play, pause, unload, seekTo, getCurrentTrackId } from '../../src/services/player';
import { downloadAudioToFile } from '../../src/services/download';

export default function PlayerScreen() {
  const { queue, removeTrack, setCurrentTrack } = usePlayer();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ title: string; author: string; artwork: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState({ position: 0, duration: 0 });
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
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
        Alert.alert('获取视频信息失败', videoResult.error || '未知错误');
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
        Alert.alert('获取音频失败', audioResult.error || '未知错误');
        setIsLoading(null);
        return;
      }

      // 下载音频到本地
      addDebugLog(`开始下载音频...`);
      const downloadResult = await downloadAudioToFile(audioResult.url, `audio_${video.bvid}_${cid}`);
      
      if (!downloadResult.success || !downloadResult.localPath) {
        addDebugLog(`下载失败: ${downloadResult.error}`);
        Alert.alert('下载失败', downloadResult.error || '无法下载音频');
        setIsLoading(null);
        return;
      }
      
      addDebugLog(`下载完成, 路径: ${downloadResult.localPath}`);

      // 加载并播放 - player.ts 会处理互斥和旧播放器清理
      const success = await loadAndPlay({
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

      if (!success) {
        Alert.alert('播放失败', '无法加载音频或正在加载其他歌曲');
      }
      
    } catch (error) {
      Alert.alert('错误', error instanceof Error ? error.message : '播放失败');
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>播放列表</Text>
        
        {getCurrentTrackId() && videoInfo && (
          <View style={styles.nowPlayingCard}>
            <Image
              source={{ uri: videoInfo.artwork }}
              style={styles.artwork}
              resizeMode="cover"
            />
            <Text style={styles.nowPlayingTitle} numberOfLines={2}>
              {videoInfo.title}
            </Text>
            <Text style={styles.nowPlayingArtist}>{videoInfo.author}</Text>
            
            <View style={styles.progressContainer}>
              <Pressable 
                style={styles.progressBar}
                onPress={handleSeek}
                onLayout={(event) => setProgressBarWidth(event.nativeEvent.layout.width)}
              >
                <View style={[styles.progressFill, { width: `${(progress.position / progress.duration) * 100 || 0}%` }]} />
                <View style={[styles.progressThumb, { left: `${(progress.position / progress.duration) * 100 || 0}%` }]} />
              </Pressable>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(progress.position)}</Text>
                <Text style={styles.timeText}>{formatTime(progress.duration)}</Text>
              </View>
            </View>
            
            <View style={styles.controls}>
              <TouchableOpacity 
                style={[styles.playControlButton, isLoading && styles.buttonDisabled]} 
                onPress={handleTogglePlay}
                disabled={!!isLoading}
              >
                <Text style={styles.playControlButtonText}>{isPlaying ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  nowPlayingCard: { backgroundColor: '#1F2937', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 24 },
  artwork: { width: 200, height: 200, borderRadius: 12, backgroundColor: '#374151', marginBottom: 16 },
  nowPlayingTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  nowPlayingArtist: { fontSize: 14, color: '#9CA3AF', marginBottom: 16 },
  progressContainer: { width: '100%', marginBottom: 16 },
  progressBar: { height: 4, backgroundColor: '#374151', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#3B82F6' },
  progressThumb: { 
    position: 'absolute', 
    width: 12, 
    height: 12, 
    borderRadius: 6, 
    backgroundColor: '#FFFFFF', 
    top: -4, 
    marginLeft: -6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  timeText: { fontSize: 12, color: '#9CA3AF' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  playControlButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  playControlButtonText: { fontSize: 28, color: '#FFFFFF' },
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
  trackTitle: { fontSize: 16, fontWeight: '500', color: '#111827', marginBottom: 4 },
  trackPage: { fontSize: 13, color: '#6B7280' },
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