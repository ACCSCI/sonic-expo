import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioStatus } from 'expo-audio';

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

// ============================================
// 事件系统
// ============================================

type Listener = (status: PlayerStatus) => void;

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
  private player: AudioPlayer | null = null;
  private statusListener: ReturnType<AudioPlayer['addListener']> | null = null;
  private currentTrack: Track | null = null;
  private state: PlayerState = 'idle';
  private position: number = 0;
  private duration: number = 0;
  private error: string | null = null;
  private emitter = new EventEmitter();
  private isInitialized = false;

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
      await setAudioModeAsync({
        shouldPlayInBackground: true,
        playsInSilentMode: true,
      });
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

    // 清理旧播放器
    await this.cleanupPlayer();

    this.state = 'loading';
    this.currentTrack = track;
    this.position = 0;
    this.error = null;
    this.notify();

    try {
      // 创建新播放器
      this.player = createAudioPlayer(track.url);
      
      // 设置状态监听
      this.setupStatusListener();

      // 开始播放
      this.player.play();
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
    if (!this.player) {
      // 如果没有播放器但有当前歌曲，重新加载
      if (this.currentTrack) {
        await this.handleLoad(this.currentTrack);
      }
      return;
    }

    if (this.state === 'paused' || this.state === 'completed') {
      if (this.state === 'completed') {
        // 播放完成状态，seek 到开头
        const player = this.player;
        player.seekTo(0);
        this.position = 0;
      }
      this.player.play();
      this.state = 'playing';
      this.notify();
    }
  }

  private async handlePause(): Promise<void> {
    if (this.player && this.state === 'playing') {
      this.player.pause();
      this.state = 'paused';
      this.notify();
    }
  }

  private async handleSeek(position: number): Promise<void> {
    // 如果没有播放器但有当前歌曲，先加载
    if (!this.player && this.currentTrack) {
      await this.handleLoad(this.currentTrack);
    }

    // 现在检查是否有播放器（可能在加载后有了）
    const player = this.player;
    if (!player) return;

    try {
      await player.seekTo(position / 1000);
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

    // 这里不做任何自动操作，让上层决定
    // 这样状态机保持纯净
  }

  private async handleError(error: string): Promise<void> {
    console.error('[PlayerStore] Error:', error);
    await this.cleanupPlayer();
    this.state = 'idle';
    this.error = error;
    this.notify();
  }

  private async handleUnload(): Promise<void> {
    await this.cleanupPlayer();
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
    if (!this.player) return;

    this.statusListener = this.player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!status.isLoaded) return;

      // 更新位置信息
      this.position = Math.floor(status.currentTime * 1000);
      this.duration = Math.floor((status.duration || 0) * 1000);

      // 检测播放状态变化
      if (status.playing && this.state !== 'playing') {
        this.state = 'playing';
      } else if (!status.playing && this.state === 'playing' && !status.didJustFinish) {
        this.state = 'paused';
      }

      // 检测播放完成
      if (status.didJustFinish) {
        // 使用 setTimeout 避免在监听器中直接修改状态导致的问题
        setTimeout(() => {
          this.dispatch({ type: 'COMPLETED' });
        }, 0);
      }

      this.notify();
    });
  }

  private async cleanupPlayer(): Promise<void> {
    if (this.statusListener) {
      this.statusListener.remove();
      this.statusListener = null;
    }

    if (this.player) {
      try {
        if (this.player.isLoaded) {
          this.player.pause();
        }
        this.player.remove();
      } catch (error) {
        console.error('[PlayerStore] Cleanup error:', error);
      }
      this.player = null;
    }
  }

  private notify(): void {
    this.emitter.emit(this.getStatus());
  }
}

// 导出单例
export const playerStore = new PlayerStore();
