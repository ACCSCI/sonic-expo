import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showToast } from '../../src/components/ToastConfig';

export default function SettingsScreen() {
  const handleClearCache = () => {
    showToast.info('功能开发中', '清理缓存功能即将上线');
  };

  const handleAbout = () => {
    showToast.info('关于', 'Bilibili 音乐播放器 v1.0');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>设置</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>存储</Text>
          <TouchableOpacity style={styles.settingItem} onPress={handleClearCache}>
            <Text style={styles.settingText}>清理缓存</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <TouchableOpacity style={styles.settingItem} onPress={handleAbout}>
            <Text style={styles.settingText}>关于应用</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>版本</Text>
            <Text style={styles.settingValue}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollView: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', margin: 16 },
  section: { backgroundColor: '#FFFFFF', marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 14, color: '#6B7280', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  settingText: { flex: 1, fontSize: 16, color: '#111827' },
  settingArrow: { fontSize: 20, color: '#9CA3AF' },
  settingValue: { fontSize: 16, color: '#6B7280' },
});
