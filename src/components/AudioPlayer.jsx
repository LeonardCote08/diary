import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import './AudioPlayer.css';

/**
 * AudioPlayer - Floating audio player component
 * Follows Deji's specs for exhibition-grade experience
 */
function AudioPlayer(props) {
    const { audioEngine, currentHotspot } = props;

    // UI State
    const [isMinimized, setIsMinimized] = createSignal(false);
    const [isPlaying, setIsPlaying] = createSignal(false);
    const [progress, setProgress] = createSignal(0);
    const [currentTime, setCurrentTime] = createSignal(0);
    const [duration, setDuration] = createSignal(0);
    const [volume, setVolume] = createSignal(80);
    const [isMuted, setIsMuted] = createSignal(false);
    const [isDraggingProgress, setIsDraggingProgress] = createSignal(false);
    const [isDraggingVolume, setIsDraggingVolume] = createSignal(false);

    // Mobile detection
    const isMobile = () => window.innerWidth <= 768;

    // Setup audio engine callbacks
    createEffect(() => {
        if (!audioEngine) return;

        // Progress callback
        audioEngine.onProgress = (progressData) => {
            if (!isDraggingProgress()) {
                setProgress(progressData.percent);
                setCurrentTime(progressData.current);
                setDuration(progressData.duration);
            }
        };

        // Playback state callbacks
        audioEngine.onPlaybackStart = (hotspotId) => {
            setIsPlaying(true);
        };

        audioEngine.onPlaybackEnd = (hotspotId) => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
        };

        // Set initial volume
        audioEngine.setVolume(volume() / 100);
    });

    // Keyboard shortcuts
    createEffect(() => {
        const handleKeyPress = (e) => {
            // Only handle if player is visible and not minimized
            if (!currentHotspot() || isMinimized()) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    if (e.shiftKey) {
                        e.preventDefault();
                        skipBackward();
                    }
                    break;
                case 'ArrowRight':
                    if (e.shiftKey) {
                        e.preventDefault();
                        skipForward();
                    }
                    break;
                case 'm':
                case 'M':
                    toggleMute();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        onCleanup(() => window.removeEventListener('keydown', handleKeyPress));
    });

    // Update playing state from audio engine
    createEffect(() => {
        if (audioEngine) {
            const state = audioEngine.getState();
            setIsPlaying(state.isPlaying);
            setIsMuted(state.isMuted);
        }
    });

    // Control functions
    const togglePlayPause = () => {
        if (!audioEngine || !currentHotspot()) return;

        if (isPlaying()) {
            audioEngine.pause();
        } else {
            audioEngine.resume();
        }
    };

    const skipForward = () => {
        if (audioEngine) audioEngine.skip(15);
    };

    const skipBackward = () => {
        if (audioEngine) audioEngine.skip(-15);
    };

    const toggleMute = () => {
        if (!audioEngine) return;
        const muted = audioEngine.toggleMute();
        setIsMuted(muted);
    };

    const handleProgressClick = (e) => {
        if (!audioEngine) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        audioEngine.seekToPercent(percent);
        setProgress(percent);
    };

    const handleProgressDrag = (e) => {
        if (!isDraggingProgress()) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        setProgress(percent);
    };

    const handleProgressMouseUp = () => {
        if (isDraggingProgress() && audioEngine) {
            audioEngine.seekToPercent(progress());
            setIsDraggingProgress(false);
        }
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseInt(e.target.value);
        setVolume(newVolume);
        if (audioEngine) {
            audioEngine.setVolume(newVolume / 100);
            if (newVolume > 0 && isMuted()) {
                audioEngine.toggleMute();
                setIsMuted(false);
            }
        }
    };

    // Format time helper
    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Get hotspot display name
    const getHotspotName = () => {
        const hotspot = currentHotspot();
        if (!hotspot) return '';

        // Use narration title if available, otherwise use ID
        return hotspot.narrationTitle || `Hotspot ${hotspot.id}`;
    };

    return (
        <Show when={currentHotspot()}>
            <div
                class={`audio-player ${isMinimized() ? 'minimized' : ''} ${isMobile() ? 'mobile' : 'desktop'}`}
                onMouseUp={handleProgressMouseUp}
                onMouseLeave={handleProgressMouseUp}
            >
                {/* Minimized State */}
                <Show when={isMinimized()}>
                    <div class="audio-player-minimized">
                        <button
                            class="btn-expand"
                            onClick={() => setIsMinimized(false)}
                            title="Expand player"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 11l4-4H4l4 4z" />
                            </svg>
                        </button>
                        <span class="track-name-mini">{getHotspotName()}</span>
                        <button
                            class={`btn-play-mini ${isPlaying() ? 'playing' : ''}`}
                            onClick={togglePlayPause}
                        >
                            {isPlaying() ? '❚❚' : '▶'}
                        </button>
                    </div>
                </Show>

                {/* Expanded State */}
                <Show when={!isMinimized()}>
                    <div class="audio-player-expanded">
                        {/* Header */}
                        <div class="player-header">
                            <h4 class="track-name">{getHotspotName()}</h4>
                            <button
                                class="btn-minimize"
                                onClick={() => setIsMinimized(true)}
                                title="Minimize player"
                            >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 5l-4 4h8L8 5z" />
                                </svg>
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div class="progress-section">
                            <span class="time-current">{formatTime(currentTime())}</span>
                            <div
                                class="progress-bar"
                                onClick={handleProgressClick}
                                onMouseDown={() => setIsDraggingProgress(true)}
                                onMouseMove={handleProgressDrag}
                            >
                                <div class="progress-track">
                                    <div
                                        class="progress-fill"
                                        style={{ width: `${progress()}%` }}
                                    />
                                    <div
                                        class="progress-thumb"
                                        style={{ left: `${progress()}%` }}
                                    />
                                </div>
                            </div>
                            <span class="time-duration">{formatTime(duration())}</span>
                        </div>

                        {/* Controls */}
                        <div class="controls-section">
                            <div class="controls-left">
                                <button
                                    class="btn-skip btn-skip-back"
                                    onClick={skipBackward}
                                    title="Skip back 15s"
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10 5V2L5 6l5 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                                        <text x="10" y="14" text-anchor="middle" font-size="8" fill="currentColor">15</text>
                                    </svg>
                                </button>

                                <button
                                    class={`btn-play ${isPlaying() ? 'playing' : ''}`}
                                    onClick={togglePlayPause}
                                    title={isPlaying() ? 'Pause' : 'Play'}
                                >
                                    <Show when={!isPlaying()}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </Show>
                                    <Show when={isPlaying()}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                        </svg>
                                    </Show>
                                </button>

                                <button
                                    class="btn-skip btn-skip-forward"
                                    onClick={skipForward}
                                    title="Skip forward 15s"
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10 7V2l5 4-5 4V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
                                        <text x="10" y="14" text-anchor="middle" font-size="8" fill="currentColor">15</text>
                                    </svg>
                                </button>
                            </div>

                            <div class="controls-right">
                                <button
                                    class="btn-mute"
                                    onClick={toggleMute}
                                    title={isMuted() ? 'Unmute' : 'Mute'}
                                >
                                    <Show when={!isMuted() && volume() > 0}>
                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M3 9v2h4l5 5V4L7 9H3zm13.5 1c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                                        </svg>
                                    </Show>
                                    <Show when={isMuted() || volume() === 0}>
                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M16.5 10c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 12.91 21 11.5 21 10c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v2h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 17 21 15.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                        </svg>
                                    </Show>
                                </button>

                                <Show when={!isMobile()}>
                                    <input
                                        type="range"
                                        class="volume-slider"
                                        min="0"
                                        max="100"
                                        value={volume()}
                                        onInput={handleVolumeChange}
                                        title={`Volume: ${volume()}%`}
                                    />
                                </Show>
                            </div>
                        </div>

                        {/* Keyboard shortcuts hint */}
                        <Show when={!isMobile()}>
                            <div class="keyboard-hints">
                                <span>Space: Play/Pause</span>
                                <span>Shift+←→: Skip</span>
                                <span>M: Mute</span>
                            </div>
                        </Show>
                    </div>
                </Show>
            </div>
        </Show>
    );
}

export default AudioPlayer;