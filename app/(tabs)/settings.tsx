import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { usePlayer } from '../../src/context/PlayerContext';
import { clearCacheStorage, clearDownloadStorage, getStorageUsage } from '../../src/services/download';
import { showToast } from '../../src/components/ToastConfig';

interface StorageUsage {
  cacheBytes: number;
  downloadBytes: number;
}

export default function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const { clearDownloadedTracks } = usePlayer();
  const insets = useSafeAreaInsets();

  const [storageUsage, setStorageUsage] = useState<StorageUsage>({ cacheBytes: 0, downloadBytes: 0 });
  const [isLoadingStorage, setIsLoadingStorage] = useState(true);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isClearingDownloads, setIsClearingDownloads] = useState(false);

  const refreshStorageUsage = useCallback(async () => {
    setIsLoadingStorage(true);
    const usage = await getStorageUsage();
    if (usage) {
      setStorageUsage(usage);
    }
    setIsLoadingStorage(false);
  }, []);

  useEffect(() => {
    refreshStorageUsage();
  }, [refreshStorageUsage]);

  const formatBytes = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
  }, []);

  const { totalBytes, cacheRatio, downloadRatio } = useMemo(() => {
    const total = storageUsage.cacheBytes + storageUsage.downloadBytes;
    const cache = total > 0 ? storageUsage.cacheBytes / total : 0;
    const download = total > 0 ? storageUsage.downloadBytes / total : 0;
    return { totalBytes: total, cacheRatio: cache, downloadRatio: download };
  }, [storageUsage]);

  const confirmTwice = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: '继续',
        style: 'destructive',
        onPress: () => {
          Alert.alert('再次确认', '此操作不可恢复，确定继续？', [
            { text: '取消', style: 'cancel' },
            { text: '确定', style: 'destructive', onPress: onConfirm },
          ]);
        },
      },
    ]);
  }, []);

  const handleClearCache = useCallback(() => {
    if (isClearingCache) return;
    confirmTwice('清理缓存', '将删除所有缓存文件。', async () => {
      setIsClearingCache(true);
      const result = await clearCacheStorage();
      if (result.success) {
        showToast.success('清理完成', '缓存已清理');
        await refreshStorageUsage();
      } else {
        showToast.error('清理失败', result.error || '无法清理缓存');
      }
      setIsClearingCache(false);
    });
  }, [confirmTwice, isClearingCache, refreshStorageUsage]);

  const handleClearDownloads = useCallback(() => {
    if (isClearingDownloads) return;
    confirmTwice('删除下载', '将删除所有已下载音频。', async () => {
      setIsClearingDownloads(true);
      const result = await clearDownloadStorage();
      if (result.success) {
        clearDownloadedTracks();
        showToast.success('删除完成', '下载内容已清理');
        await refreshStorageUsage();
      } else {
        showToast.error('删除失败', result.error || '无法删除下载');
      }
      setIsClearingDownloads(false);
    });
  }, [clearDownloadedTracks, confirmTwice, isClearingDownloads, refreshStorageUsage]);

  const handleOpenUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      showToast.error('打开失败', error instanceof Error ? error.message : '无法打开链接');
    }
  }, []);

  const tabBarHeight = 68;
  const contentBottomPadding = 16 + tabBarHeight + insets.bottom;

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
        <Text style={[styles.title, isDark && styles.textDark]}>设置</Text>
        
        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>外观</Text>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, isDark && styles.textDark]}>深色模式</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#D1D5DB', true: '#3B82F6' }}
              thumbColor={isDark ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>
        </View>

        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>存储</Text>
          <View style={styles.storageCard}>
            {isLoadingStorage ? (
              <View style={styles.storageLoading}>
                <ActivityIndicator size="small" color={isDark ? '#F9FAFB' : '#3B82F6'} />
                <Text style={[styles.storageLoadingText, isDark && styles.textDark]}>正在计算...</Text>
              </View>
            ) : (
              <>
                <View style={styles.storageRow}>
                  <Text style={[styles.storageLabel, isDark && styles.textDark]}>总计</Text>
                  <Text style={[styles.storageValue, isDark && styles.valueDark]}>{formatBytes(totalBytes)}</Text>
                </View>
                <View style={styles.storageBar}>
                  <View style={[styles.storageBarSegment, styles.storageBarCache, { flex: cacheRatio || 0 }]} />
                  <View style={[styles.storageBarSegment, styles.storageBarDownload, { flex: downloadRatio || 0 }]} />
                </View>
                <View style={styles.storageRow}>
                  <Text style={[styles.storageLabel, isDark && styles.textDark]}>缓存</Text>
                  <Text style={[styles.storageValue, isDark && styles.valueDark]}>{formatBytes(storageUsage.cacheBytes)}</Text>
                </View>
                <View style={styles.storageRow}>
                  <Text style={[styles.storageLabel, isDark && styles.textDark]}>下载</Text>
                  <Text style={[styles.storageValue, isDark && styles.valueDark]}>{formatBytes(storageUsage.downloadBytes)}</Text>
                </View>
              </>
            )}
          </View>
          <TouchableOpacity
            style={[styles.settingItem, (isClearingCache || isLoadingStorage) && styles.settingItemDisabled]}
            onPress={handleClearCache}
            disabled={isClearingCache || isLoadingStorage}
          >
            <Text style={[styles.settingText, isDark && styles.textDark]}>清理缓存</Text>
            {isClearingCache ? (
              <ActivityIndicator size="small" color={isDark ? '#F9FAFB' : '#3B82F6'} />
            ) : (
              <Feather name="chevron-right" size={18} color={isDark ? '#9CA3AF' : '#9CA3AF'} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingItem, (isClearingDownloads || isLoadingStorage) && styles.settingItemDisabled]}
            onPress={handleClearDownloads}
            disabled={isClearingDownloads || isLoadingStorage}
          >
            <Text style={[styles.settingText, isDark && styles.textDark]}>删除下载</Text>
            {isClearingDownloads ? (
              <ActivityIndicator size="small" color={isDark ? '#F9FAFB' : '#3B82F6'} />
            ) : (
              <Feather name="chevron-right" size={18} color={isDark ? '#9CA3AF' : '#9CA3AF'} />
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>关于</Text>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, isDark && styles.textDark]}>应用名称</Text>
            <Text style={[styles.settingValue, isDark && styles.valueDark]}>sonic</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, isDark && styles.textDark]}>版本</Text>
            <Text style={[styles.settingValue, isDark && styles.valueDark]}>1.0</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, isDark && styles.textDark]}>作者</Text>
            <Text style={[styles.settingValue, isDark && styles.valueDark]}>加速科学(ACCSCI)</Text>
          </View>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => handleOpenUrl('https://github.com/ACCSCI/sonic-expo')}
          >
            <Text style={[styles.settingText, isDark && styles.textDark]}>项目主页</Text>
            <View style={styles.settingIconRow}>
              <Text style={[styles.settingValue, isDark && styles.valueDark]}>github.com/ACCSCI/sonic-expo</Text>
              <Feather name="external-link" size={16} color={isDark ? '#9CA3AF' : '#9CA3AF'} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => handleOpenUrl('https://github.com/ACCSCI')}
          >
            <Text style={[styles.settingText, isDark && styles.textDark]}>作者主页</Text>
            <View style={styles.settingIconRow}>
              <Text style={[styles.settingValue, isDark && styles.valueDark]}>github.com/ACCSCI</Text>
              <Feather name="external-link" size={16} color={isDark ? '#9CA3AF' : '#9CA3AF'} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  containerDark: { backgroundColor: '#1F2937' },
  scrollView: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', margin: 16 },
  textDark: { color: '#F9FAFB' },
  section: { backgroundColor: '#FFFFFF', marginTop: 16, paddingHorizontal: 16 },
  sectionDark: { backgroundColor: '#374151' },
  sectionTitle: { fontSize: 14, color: '#6B7280', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  sectionTitleDark: { color: '#9CA3AF' },
  storageCard: { paddingVertical: 12 },
  storageLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  storageLoadingText: { fontSize: 14, color: '#6B7280' },
  storageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  storageLabel: { fontSize: 14, color: '#6B7280' },
  storageValue: { fontSize: 14, color: '#111827', fontWeight: '600' },
  storageBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#E5E7EB', marginVertical: 8 },
  storageBarSegment: { height: '100%' },
  storageBarCache: { backgroundColor: '#60A5FA' },
  storageBarDownload: { backgroundColor: '#34D399' },
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  settingItemDisabled: { opacity: 0.6 },
  settingText: { flex: 1, fontSize: 16, color: '#111827' },
  settingIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingValue: { fontSize: 16, color: '#6B7280' },
  valueDark: { color: '#9CA3AF' },
});
