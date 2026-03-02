import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  loadThemePreference,
  saveThemePreference,
  ThemePreference,
} from '../storage/themeStorage';

interface ThemeContextType {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('light');
  const [isLoading, setIsLoading] = useState(true);

  // 加载保存的主题偏好
  useEffect(() => {
    const initTheme = async () => {
      const savedTheme = await loadThemePreference();
      setThemeState(savedTheme);
      setIsLoading(false);
    };
    initTheme();
  }, []);

  // 设置主题（并保存到存储）
  const setTheme = useCallback(async (newTheme: ThemePreference) => {
    setThemeState(newTheme);
    await saveThemePreference(newTheme);
  }, []);

  // 切换主题
  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
