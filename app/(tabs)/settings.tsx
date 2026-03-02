import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';
import { showToast } from '../../src/components/ToastConfig';

export default function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const handleClearCache = () => {
    showToast.info('功能开发中', '清理缓存功能即将上线');
  };

  const handleAbout = () => {
    showToast.info('关于', 'Bilibili 音乐播放器 v1.0');
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView style={styles.scrollView}>
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
          <TouchableOpacity style={styles.settingItem} onPress={handleClearCache}>
            <Text style={[styles.settingText, isDark && styles.textDark]}>清理缓存</Text>
            <Text style={[styles.settingArrow, isDark && styles.arrowDark]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, isDark && styles.sectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>关于</Text>
          <TouchableOpacity style={styles.settingItem} onPress={handleAbout}>
            <Text style={[styles.settingText, isDark && styles.textDark]}>关于应用</Text>
            <Text style={[styles.settingArrow, isDark && styles.arrowDark]}>›</Text>
          </TouchableOpacity>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, isDark && styles.textDark]}>版本</Text>
            <Text style={[styles.settingValue, isDark && styles.valueDark]}>1.0.0</Text>
          </View>
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
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  settingText: { flex: 1, fontSize: 16, color: '#111827' },
  settingArrow: { fontSize: 20, color: '#9CA3AF' },
  arrowDark: { color: '#9CA3AF' },
  settingValue: { fontSize: 16, color: '#6B7280' },
  valueDark: { color: '#9CA3AF' },
});
