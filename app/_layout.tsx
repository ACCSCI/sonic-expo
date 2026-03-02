import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import TrackPlayer from 'react-native-track-player';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { PlayerProvider } from '@/src/context/PlayerContext';
import { ThemeProvider as AppThemeProvider } from '@/src/context/ThemeContext';
import { toastConfig } from '@/src/components/ToastConfig';
import trackPlayerService from '@/src/services/trackPlayerService';

TrackPlayer.registerPlaybackService(() => trackPlayerService);

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutInner() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PlayerProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
      </PlayerProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Toast config={toastConfig} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootLayoutInner />
    </AppThemeProvider>
  );
}
