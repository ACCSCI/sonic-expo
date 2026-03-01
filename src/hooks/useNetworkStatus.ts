import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

let isNetworkAvailable = true;

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      const reachable = state.isInternetReachable ?? false;
      
      setIsConnected(connected);
      setIsInternetReachable(reachable);
      isNetworkAvailable = connected && reachable;
      
      console.log('[Network] Status changed:', { connected, reachable });
    });

    // 初始检查
    NetInfo.fetch().then((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      const reachable = state.isInternetReachable ?? false;
      setIsConnected(connected);
      setIsInternetReachable(reachable);
      isNetworkAvailable = connected && reachable;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isConnected,
    isInternetReachable,
    isOnline: isConnected && isInternetReachable,
  };
}

export function getNetworkStatus(): boolean {
  return isNetworkAvailable;
}

export async function checkNetworkStatus(): Promise<boolean> {
  const state = await NetInfo.fetch();
  const available = (state.isConnected ?? false) && (state.isInternetReachable ?? false);
  isNetworkAvailable = available;
  return available;
}
