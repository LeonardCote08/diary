import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import './AudioPlayer.css';

// Refined SVG icons with thinner, more elegant strokes
const PlayIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M5 3l8 5-8 5V3z" strokeLinejoin="round" fill="rgba(255,255,255,0.9)" stroke="none" />
    </svg>
);

const PauseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M5 3v10M11 3v10" strokeLinecap="round" />
    </svg>
);

const SkipBackIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M9 16A7 7 0 109 2a7 7 0 000 14z" opacity="0.3" />
        <path d="M9 7V5L6 8l3 3V9c2 0 3.5 1.5 3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const SkipForwardIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M9 16A7 7 0 109 2a7 7 0 000 14z" opacity="0.3" />
        <path d="M9 9V5l3 3-3 3v-2c-2 0-3.5 1.5-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const VolumeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M3 6v4h2.5L9 13V3L5.5 6H3z" strokeLinejoin="round" />
        <path d="M11.5 5.5c.8.7.8 2.3 0 3" strokeLinecap="round" opacity="0.7" />
    </svg>
);

const MuteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M3 6v4h2.5L9 13V3L5.5 6H3z" strokeLinejoin="round" />
        <path d="M11 6l3 3m0-3l-3 3" strokeLinecap="round" opacity="0.7" />
    </svg>
);

const MinimizeIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M2 4.5h8M4.5 7.5l2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/**
 * AudioPlayer - Refined floating audio player component
 * Exhibition-grade experience with literary aesthetic
 */
function AudioPlayer(props) {
    const { audioEngine, currentHotspot } = props;

    // UI State
    const [isMinimized, setIsMinimized] = createSignal(true); // Start minimized
    const [isPlaying, setIsPlaying] = createSignal(false);
    const [progress, setProgress] = createSignal(0);
    const [currentTime, setCurrentTime] = createSignal(0);
    const [duration, setDuration] = createSignal(0);
    const [volume, setVolume] = createSignal(80);
    const [isMuted, setIsMuted] = createSignal(false);
    const [isDraggingProgress, setIsDraggingProgress] = createSignal(false);

    // Track if this is the first playback in the session
    const [isFirstPlayback, setIsFirstPlayback] = createSignal(true);

    // Track hotspot changes for visual feedback
    const [isChangingTrack, setIsChangingTrack] = createSignal(false);

    // Watch for hotspot changes
    createEffect(() => {
        const hotspot = currentHotspot();
        if (hotspot && isPlaying() && isMinimized()) {
            // Briefly indicate track change
            setIsChangingTrack(true);
            setTimeout(() => setIsChangingTrack(false), 500);
        }
    });

    // Mobile detection
    const isMobile = () => window.innerWidth <= 768;

    // Setup audio engine callbacks
    createEffect(() => {
        if (!audioEngine) return;

        audioEngine.onProgress = (progressData) => {
            if (!isDraggingProgress()) {
                setProgress(progressData.percent);
                setCurrentTime(progressData.current);
                setDuration(progressData.duration);
            }
        };

        audioEngine.onPlaybackStart = () => {
            setIsPlaying(true);
            // Only auto-expand on first playback
            if (isMinimized() && isFirstPlayback()) {
                setIsMinimized(false);
                setIsFirstPlayback(false);
            } else if (!isMinimized()) {
                // If already expanded, mark that we've had our first playback
                setIsFirstPlayback(false);
            }
        };

        audioEngine.onPlaybackEnd = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
        };

        audioEngine.setVolume(volume() / 100);
    });

    // Keyboard shortcuts
    createEffect(() => {
        const handleKeyPress = (e) => {
            if (!currentHotspot()) return;

            // Don't handle if typing in an input
            if (e.target.tagName === 'INPUT') return;

            switch (e.key) {
                case ' ':
                    if (!isMinimized()) {
                        e.preventDefault();
                        togglePlayPause();
                    }
                    break;
                case 'ArrowLeft':
                    if (e.shiftKey && !isMinimized()) {
                        e.preventDefault();
                        skipBackward();
                    }
                    break;
                case 'ArrowRight':
                    if (e.shiftKey && !isMinimized()) {
                        e.preventDefault();
                        skipForward();
                    }
                    break;
                case 'm':
                case 'M':
                    if (!isMinimized()) {
                        toggleMute();
                    }
                    break;
                case 'Escape':
                    if (!isMinimized()) {
                        setIsMinimized(true);
                    }
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
        return hotspot.narrationTitle || `Hotspot ${hotspot.id}`;
    };

    return (
        <Show when={currentHotspot()}>
            <div
                class={`audio-player ${isMinimized() ? 'minimized' : ''} ${isMobile() ? 'mobile' : 'desktop'}`}
                onMouseUp={handleProgressMouseUp}
                onMouseLeave={handleProgressMouseUp}
            >
                {/* Minimized State - Circular button */}
                <Show when={isMinimized()}>
                    <div class="audio-player-minimized">
                        <button
                            class={`btn-play-mini ${isPlaying() ? 'playing' : ''} ${isChangingTrack() ? 'changing' : ''}`}
                            onClick={() => {
                                if (!isPlaying()) {
                                    // Just expand, don't auto-play
                                    setIsMinimized(false);
                                } else {
                                    // If playing, toggle pause
                                    togglePlayPause();
                                }
                            }}
                            title={isPlaying() ? 'Pause' : 'Play'}
                        >
                            {isPlaying() ? <PauseIcon /> : <PlayIcon />}
                        </button>
                        <div class="track-name-mini-container">
                            <span class="track-name-mini">{getHotspotName()}</span>
                        </div>
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
                                title="Minimize (Esc)"
                            >
                                <MinimizeIcon />
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
                                <Show when={!isMobile()}>
                                    <button
                                        class="btn-skip btn-skip-back"
                                        onClick={skipBackward}
                                        title="Back 15s (Shift+←)"
                                    >
                                        <SkipBackIcon />
                                    </button>
                                </Show>

                                <button
                                    class={`btn-play ${isPlaying() ? 'playing' : ''}`}
                                    onClick={togglePlayPause}
                                    title={isPlaying() ? 'Pause (Space)' : 'Play (Space)'}
                                >
                                    <Show when={!isPlaying()}>
                                        <PlayIcon />
                                    </Show>
                                    <Show when={isPlaying()}>
                                        <PauseIcon />
                                    </Show>
                                </button>

                                <Show when={!isMobile()}>
                                    <button
                                        class="btn-skip btn-skip-forward"
                                        onClick={skipForward}
                                        title="Forward 15s (Shift+→)"
                                    >
                                        <SkipForwardIcon />
                                    </button>
                                </Show>
                            </div>

                            <div class="controls-right">
                                <button
                                    class="btn-mute"
                                    onClick={toggleMute}
                                    title={isMuted() ? 'Unmute (M)' : 'Mute (M)'}
                                >
                                    <Show when={!isMuted() && volume() > 0}>
                                        <VolumeIcon />
                                    </Show>
                                    <Show when={isMuted() || volume() === 0}>
                                        <MuteIcon />
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

                        {/* Hidden keyboard hints for cleaner look */}
                        <Show when={false}>
                            <div class="keyboard-hints">
                                <span>Space: Play/Pause</span>
                                <span>Shift+←→: Skip</span>
                                <span>M: Mute</span>
                                <span>Esc: Minimize</span>
                            </div>
                        </Show>
                    </div>
                </Show>
            </div>
        </Show>
    );
}

export default AudioPlayer;