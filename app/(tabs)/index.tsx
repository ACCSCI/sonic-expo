import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  AppState,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseInput } from '../../src/utils/parser';
import { usePlayer } from '../../src/context/PlayerContext';
import { getVideoInfo } from '../../src/services/bilibili';
import { showToast } from '../../src/components/ToastConfig';

export default function ParseScreen() {
  const [bvNumber, setBvNumber] = useState('');
  const [pageNumber, setPageNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<{ bvid: string; page: number; fullUrl?: string } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const { addTrack } = usePlayer();

  const checkClipboard = useCallback(async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();
      if (clipboardContent) {
        const result = await parseInput(clipboardContent);
        if (result && result.bvid !== bvNumber) {
          setBvNumber(result.bvid);
          setPageNumber(result.page > 1 ? String(result.page) : '');
          return true;
        }
      }
    } catch (error) {
      console.log('Clipboard check error:', error);
    }
    return false;
  }, [bvNumber]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        checkClipboard();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    checkClipboard();

    return () => {
      subscription.remove();
    };
  }, [checkClipboard]);

  const handleParse = async () => {
    const input = bvNumber.trim();
    if (!input) {
      showToast.info('提示', '请输入 BV 号或链接');
      return;
    }

    if (isParsing) {
      return;
    }

    setIsParsing(true);
    setIsLoading(true);
    setParseError(null);
    setParsedResult(null);

    try {
      const result = await parseInput(input);
      
      if (!result) {
        setParseError('无法识别 BV 号或链接');
        setIsLoading(false);
        return;
      }

      let finalPage = result.page;
      if (pageNumber.trim()) {
        const manualPage = parseInt(pageNumber, 10);
        if (!isNaN(manualPage) && manualPage > 0) {
          finalPage = manualPage;
        }
      }

      setParsedResult({
        bvid: result.bvid,
        page: finalPage,
        fullUrl: result.fullUrl,
      });
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '解析失败');
    } finally {
      setIsLoading(false);
      setIsParsing(false);
    }
  };

  const handleAddToPlaylist = async () => {
    if (!parsedResult) {
      showToast.info('提示', '请先解析视频');
      return;
    }

    setIsLoading(true);
    
    try {
      // 获取视频信息以获取标题和作者
      const videoResult = await getVideoInfo(parsedResult.bvid);
      
      const title = videoResult.success && videoResult.video 
        ? videoResult.video.title 
        : undefined;
      const author = videoResult.success && videoResult.video 
        ? videoResult.video.author 
        : undefined;
      
      // 获取对应分P的cid
      let cid = videoResult.success && videoResult.video 
        ? String(videoResult.video.cid) 
        : parsedResult.bvid;
      
      // 如果有分P，找到对应分P的cid
      if (videoResult.success && videoResult.video?.pages && parsedResult.page > 1) {
        const pageInfo = videoResult.video.pages.find(p => p.page === parsedResult.page);
        if (pageInfo) {
          cid = String(pageInfo.cid);
        }
      }
      
      const fullUrl = parsedResult.fullUrl || `https://www.bilibili.com/video/${parsedResult.bvid}`;
      
      addTrack(parsedResult.bvid, cid, parsedResult.page, title, author, fullUrl);
      
      showToast.success(
        '已添加到播放列表',
        `${title || '未知标题'} - UP主: ${author || '未知'} - 分P: ${parsedResult.page}`
      );
    } catch (error) {
      // 如果获取信息失败，仍然添加曲目但使用默认值
      const fullUrl = parsedResult.fullUrl || `https://www.bilibili.com/video/${parsedResult.bvid}`;
      addTrack(parsedResult.bvid, parsedResult.bvid, parsedResult.page, undefined, undefined, fullUrl);
      
      showToast.success(
        '已添加到播放列表',
        `BV: ${parsedResult.bvid} - 分P: ${parsedResult.page}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    const bv = await checkClipboard();
    if (!bv) {
      const content = await Clipboard.getStringAsync();
      setBvNumber(content);
      setPageNumber('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>解析 B 站音频</Text>
        
        <View style={styles.card}>
          <Text style={styles.label}>粘贴链接或 BV 号</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.bvInput]}
              placeholder="输入BV号/链接"
              placeholderTextColor="#9CA3AF"
              value={bvNumber}
              onChangeText={setBvNumber}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.input, styles.pageInput]}
              placeholder="分P"
              placeholderTextColor="#9CA3AF"
              value={pageNumber}
              onChangeText={setPageNumber}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={styles.pasteButton}
              onPress={handlePaste}
            >
              <Text style={styles.pasteButtonText}>粘贴</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.parseButton, isLoading && styles.buttonDisabled]}
          onPress={handleParse}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.parseButtonText}>开始解析</Text>
          )}
        </TouchableOpacity>

        {parseError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{parseError}</Text>
          </View>
        )}

        {parsedResult && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>✓ 解析成功</Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>BV号:</Text>
              <Text style={styles.resultValue}>{parsedResult.bvid}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>分P:</Text>
              <Text style={styles.resultValue}>第 {parsedResult.page} P</Text>
            </View>
            {parsedResult.fullUrl && (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>URL:</Text>
                <Text style={styles.resultValue} numberOfLines={1}>{parsedResult.fullUrl}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddToPlaylist}
            >
              <Text style={styles.addButtonText}>添加到播放列表</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tip}>
          <Text style={styles.tipText}>
            💡 提示：支持短链(b23.tv)、完整链接、BV号，自动识别分P
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: '#F3F4F6',
    color: '#111827',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bvInput: {
    flex: 2,
  },
  pageInput: {
    flex: 1,
  },
  pasteButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  pasteButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  parseButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  parseButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 18,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 16,
  },
  resultRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  resultLabel: {
    fontSize: 14,
    color: '#6B7280',
    width: 50,
  },
  resultValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    flex: 1,
  },
  addButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  tip: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
  },
  tipText: {
    color: '#1E40AF',
    fontSize: 14,
  },
});