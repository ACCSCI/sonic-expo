import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = '@sonic_theme';

// 主题偏好：'light' | 'dark'，默认 'light'
export type ThemePreference = 'light' | 'dark';

/**
 * 保存主题偏好到存储
 * @param theme 主题偏好
 */
export async function saveThemePreference(theme: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error('[themeStorage] Failed to save theme preference:', error);
  }
}

/**
 * 从存储加载主题偏好
 * @returns 主题偏好，默认 'light'
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const theme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (theme === 'light' || theme === 'dark') {
      return theme;
    }
  } catch (error) {
    console.error('[themeStorage] Failed to load theme preference:', error);
  }
  return 'light';
}
