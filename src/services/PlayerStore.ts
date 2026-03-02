import { AppState, AppStateStatus } from 'react-native';
import TrackPlayer, {
  Event,
  State as TrackPlayerState,
  Track as TrackPlayerTrack,
} from 'react-native-track-player';
import type {
  PlaybackActiveTrackChangedEvent,
  PlaybackErrorEvent,
  PlaybackProgressUpdatedEvent,
  PlaybackStateEvent,
} from 'react-native-track-player';

// ============================================
// 类型定义
// ============================================

export type PlayerState = 
  | 'idle'           // 空闲状态，没有加载歌曲
  | 'loading'        // 正在加载歌曲
  | 'playing'        // 正在播放
  | 'paused'         // 已暂停
  | 'completed';     // 播放完成

export interface Track {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
}

export interface PlayerStatus {
  state: PlayerState;
  track: Track | null;
  position: number;
  duration: number;
  error: string | null;
}

export type PlayerAction =
  | { type: 'LOAD'; track: Track }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; position: number }
  | { type: 'COMPLETED' }
  | { type: 'ERROR'; error: string }
  | { type: 'UNLOAD' };

type Listener = (status: PlayerStatus) => void;
type TrackPlayerSubscription = ReturnType<typeof TrackPlayer.addEventListener>;

class EventEmitter {
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(status: PlayerStatus): void {
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('PlayerStore listener error:', error);
      }
    });
  }
}

// ============================================
// PlayerStore 状态机
// ============================================

class PlayerStore {
  private currentTrack: Track | null = null;
  private state: PlayerState = 'idle';
  private position: number = 0;
  private duration: number = 0;
  private error: string | null = null;
  private emitter = new EventEmitter();
  private isInitialized = false;

  private playbackStateListener: TrackPlayerSubscription | null = null;
  private progressListener: TrackPlayerSubscription | null = null;
  private activeTrackListener: TrackPlayerSubscription | null = null;
  private queueEndedListener: TrackPlayerSubscription | null = null;
  private errorListener: TrackPlayerSubscription | null = null;
  private appStateListener: { remove: () => void } | null = null;

  // 获取当前状态（只读）
  getStatus(): PlayerStatus {
    return {
      state: this.state,
      track: this.currentTrack,
      position: this.position,
      duration: this.duration,
      error: this.error,
    };
  }

  // 订阅状态变化
  subscribe(listener: Listener): () => void {
    // 立即通知当前状态
    listener(this.getStatus());
    return this.emitter.subscribe(listener);
  }

  // 初始化音频系统
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      await TrackPlayer.setupPlayer();
      await TrackPlayer.updateOptions({
        stopWithApp: false,
        progressUpdateEventInterval: 1,
        capabilities: [],
        compactCapabilities: [],
      });

      this.setupStatusListener();
      this.setupAppStateListener();
      await this.syncWithPlayer();

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('PlayerStore init error:', error);
      return false;
    }
  }

  // 执行动作
  async dispatch(action: PlayerAction): Promise<void> {
    console.log(`[PlayerStore] Action: ${action.type}, Current state: ${this.state}`);

    switch (action.type) {
      case 'LOAD':
        await this.handleLoad(action.track);
        break;
      case 'PLAY':
        await this.handlePlay();
        break;
      case 'PAUSE':
        await this.handlePause();
        break;
      case 'SEEK':
        await this.handleSeek(action.position);
        break;
      case 'COMPLETED':
        await this.handleCompleted();
        break;
      case 'ERROR':
        await this.handleError(action.error);
        break;
      case 'UNLOAD':
        await this.handleUnload();
        break;
    }
  }

  // ============================================
  // 状态处理函数
  // ============================================

  private async handleLoad(track: Track): Promise<void> {
    // 如果正在播放同一首歌，不重载
    if (this.currentTrack?.id === track.id && this.state === 'playing') {
      console.log('[PlayerStore] Same track already playing, skip reload');
      return;
    }

    this.state = 'loading';
    this.currentTrack = track;
    this.position = 0;
    this.error = null;
    this.notify();

    try {
      await TrackPlayer.reset();
      await TrackPlayer.add(this.mapToTrackPlayerTrack(track));
      await TrackPlayer.play();
      this.state = 'playing';
      this.notify();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      console.error('[PlayerStore] Load error:', errorMessage);
      this.state = 'idle';
      this.error = errorMessage;
      this.currentTrack = null;
      this.notify();
    }
  }

  private async handlePlay(): Promise<void> {
    const playerState = await TrackPlayer.getState();

    if (playerState === TrackPlayerState.None) {
      if (this.currentTrack) {
        await this.handleLoad(this.currentTrack);
      }
      return;
    }

    if (this.state === 'completed') {
      await TrackPlayer.seekTo(0);
      this.position = 0;
    }

    await TrackPlayer.play();
    this.state = 'playing';
    this.notify();
  }

  private async handlePause(): Promise<void> {
    const playerState = await TrackPlayer.getState();
    if (playerState === TrackPlayerState.Playing || playerState === TrackPlayerState.Buffering) {
      await TrackPlayer.pause();
      this.state = 'paused';
      this.notify();
    }
  }

  private async handleSeek(position: number): Promise<void> {
    try {
      await TrackPlayer.seekTo(position / 1000);
      this.position = position;
      this.notify();
    } catch (error) {
      console.error('[PlayerStore] Seek error:', error);
    }
  }

  private async handleCompleted(): Promise<void> {
    if (this.state !== 'playing') return;

    this.state = 'completed';
    this.position = this.duration;
    this.notify();
  }

  private async handleError(error: string): Promise<void> {
    console.error('[PlayerStore] Error:', error);
    await this.resetPlayer();
    this.state = 'idle';
    this.error = error;
    this.notify();
  }

  private async handleUnload(): Promise<void> {
    await this.resetPlayer();
    this.state = 'idle';
    this.currentTrack = null;
    this.position = 0;
    this.duration = 0;
    this.error = null;
    this.notify();
  }

  // ============================================
  // 辅助函数
  // ============================================

  private setupStatusListener(): void {
    this.playbackStateListener = TrackPlayer.addEventListener(Event.PlaybackState, ({ state }: PlaybackStateEvent) => {
      const mappedState = this.mapPlayerState(state);
      if (mappedState !== this.state) {
        this.state = mappedState;
      }
      this.notify();
    });

    this.progressListener = TrackPlayer.addEventListener(
      Event.PlaybackProgressUpdated,
      ({ position, duration }: PlaybackProgressUpdatedEvent) => {
        this.position = Math.floor(position * 1000);
        this.duration = Math.floor(duration * 1000);
        this.notify();
      }
    );

    this.activeTrackListener = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      async (event: PlaybackActiveTrackChangedEvent) => {
        const trackId = event.track ?? null;
        const track = trackId ? await TrackPlayer.getTrack(trackId) : await TrackPlayer.getActiveTrack();
        if (track) {
          this.currentTrack = this.mapFromTrackPlayerTrack(track);
          this.notify();
        }
      }
    );

    this.queueEndedListener = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      this.dispatch({ type: 'COMPLETED' });
    });

    this.errorListener = TrackPlayer.addEventListener(Event.PlaybackError, (event: PlaybackErrorEvent) => {
      const errorMessage = event.message || '播放错误';
      this.dispatch({ type: 'ERROR', error: errorMessage });
    });
  }

  private setupAppStateListener(): void {
    if (this.appStateListener) return;

    this.appStateListener = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        this.syncWithPlayer();
      }
    });
  }

  private async syncWithPlayer(): Promise<void> {
    try {
      const [state, position, duration, activeTrack] = await Promise.all([
        TrackPlayer.getState(),
        TrackPlayer.getPosition(),
        TrackPlayer.getDuration(),
        TrackPlayer.getActiveTrack(),
      ]);

      this.state = this.mapPlayerState(state);
      this.position = Math.floor(position * 1000);
      this.duration = Math.floor(duration * 1000);
      this.currentTrack = activeTrack ? this.mapFromTrackPlayerTrack(activeTrack) : this.currentTrack;
      this.notify();
    } catch (error) {
      console.error('[PlayerStore] Sync error:', error);
    }
  }

  private mapPlayerState(state: TrackPlayerState): PlayerState {
    switch (state) {
      case TrackPlayerState.Playing:
        return 'playing';
      case TrackPlayerState.Paused:
        return 'paused';
      case TrackPlayerState.Buffering:
        return 'loading';
      case TrackPlayerState.Ready:
        return this.state === 'loading' ? 'paused' : this.state;
      case TrackPlayerState.Stopped:
      case TrackPlayerState.None:
      default:
        return 'idle';
    }
  }

  private mapToTrackPlayerTrack(track: Track): TrackPlayerTrack {
    return {
      id: track.id,
      url: track.url,
      title: track.title,
      artist: track.artist,
      artwork: track.artwork,
      duration: track.duration,
    };
  }

  private mapFromTrackPlayerTrack(track: TrackPlayerTrack): Track {
    return {
      id: String(track.id),
      url: track.url || '',
      title: track.title || '',
      artist: track.artist || '',
      artwork: typeof track.artwork === 'string' ? track.artwork : '',
      duration: track.duration ? Math.floor(track.duration) : 0,
    };
  }

  private async resetPlayer(): Promise<void> {
    try {
      await TrackPlayer.reset();
    } catch (error) {
      console.error('[PlayerStore] Reset error:', error);
    }
  }

  private notify(): void {
    this.emitter.emit(this.getStatus());
  }
}

export const playerStore = new PlayerStore();
