import TrackPlayer, { Event, Track as TrackPlayerTrack } from 'react-native-track-player';
import { loadQueueState, saveQueueState, PersistedState } from '../storage/queueStorage';
import { resolveTrackForPlayback } from './audioLoader';
import { QueuedTrack, RepeatMode } from '../context/PlayerContext';

let isHandlingAutoNext = false;

function getNextTrack(
  state: PersistedState,
  currentTrackId: string | null
): QueuedTrack | null {
  if (!state.queue.length) return null;

  const currentIndex = currentTrackId
    ? state.queue.findIndex((track) => track.id === currentTrackId)
    : -1;

  switch (state.repeatMode) {
    case 'one':
      return currentIndex >= 0 ? state.queue[currentIndex] : state.queue[0];
    case 'shuffle': {
      if (state.queue.length === 1) return state.queue[0];
      const availableIndices = state.queue
        .map((_, index) => index)
        .filter((index) => index !== currentIndex);
      const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      return state.queue[randomIndex];
    }
    case 'all': {
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % state.queue.length : 0;
      return state.queue[nextIndex];
    }
    case 'off':
    default:
      if (currentIndex >= 0 && currentIndex < state.queue.length - 1) {
        return state.queue[currentIndex + 1];
      }
      return null;
  }
}

async function handleAutoNext(): Promise<void> {
  if (isHandlingAutoNext) return;
  isHandlingAutoNext = true;

  try {
    const savedState = await loadQueueState();
    if (!savedState) return;

    const activeTrack = await TrackPlayer.getActiveTrack();
    const activeTrackId = activeTrack?.id ? String(activeTrack.id) : savedState.currentTrackId;
    const nextTrack = getNextTrack(savedState, activeTrackId);

    if (!nextTrack) {
      await TrackPlayer.stop();
      return;
    }

    const resolveResult = await resolveTrackForPlayback(nextTrack);
    if (!resolveResult.success || !resolveResult.track) {
      return;
    }

    const trackData: TrackPlayerTrack = {
      id: resolveResult.track.id,
      url: resolveResult.track.url,
      title: resolveResult.track.title,
      artist: resolveResult.track.artist,
      artwork: resolveResult.track.artwork,
      duration: resolveResult.track.duration,
    };

    await TrackPlayer.reset();
    await TrackPlayer.add(trackData);
    await TrackPlayer.play();

    await saveQueueState({
      queue: savedState.queue,
      currentTrackId: nextTrack.id,
      position: 0,
      repeatMode: savedState.repeatMode as RepeatMode,
      downloadedTrackIds: savedState.downloadedTrackIds || [],
    });
  } catch (error) {
    console.error('[TrackPlayerService] Auto-next error:', error);
  } finally {
    isHandlingAutoNext = false;
  }
}

export default async function trackPlayerService(): Promise<void> {
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, handleAutoNext);
}
