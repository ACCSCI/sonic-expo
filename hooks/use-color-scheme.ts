import { useTheme } from '@/src/context/ThemeContext';

export function useColorScheme(): 'light' | 'dark' {
  const { theme } = useTheme();
  return theme;
}
