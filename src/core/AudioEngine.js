import { Howl, Howler } from 'howler';

/**
 * AudioEngine - Manages audio playback with sub-150ms latency
 * Uses Howler.js for cross-browser compatibility and preloading
 * Handles missing files gracefully with placeholders
 */
class AudioEngine {
    constructor() {
        // Audio management
        this.sounds = new Map();
        this.currentSound = null;
        this.previousSound = null;
        this.isPlaying = false;
        this.currentHotspotId = null;

        // Preloading
        this.preloadQueue = [];
        this.isPreloading = false;
        this.preloadedCount = 0;
        this.maxPreloadCount = 5;

        // Crossfade settings
        this.crossfadeEnabled = true;
        this.crossfadeDuration = 500; // ms
        this.isCrossfading = false;

        // Volume
        this.masterVolume = 0.8;
        this.isMuted = false;

        // Placeholder audio for testing
        this.placeholderUrl = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBiuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OWT' +
            'AkPVqzq67JlGgBGqOLwvW0eBSuJ0fXYgjQHF2m+9N+PWw4KU6vn57RiGAA+nODyvmkfBjiS1/TNeSsFG3TI7+CMMAgZbsHy55ZNDAlVre3psmYVAEWo4vK+bCAELIHO8tiJOAcZaLvt559NEAxQqOPwtmMcBjiS1/PMeS0GI3fH8N+RQAoUXrTp66hVFApGnt/yvmwhBiuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizAJHWq+8+OWTAkPVqzq67RmGgBGqOLyvmwhBjiS1/PMeS0GI3fH8N+RQAoUXrTp66hVFApGnt/yvmwhBiuBzvLZiTYIG2m98OScTgwO';

        // Placeholder metadata
        this.placeholderDuration = 2000; // 2 seconds

        // Event callbacks
        this.onPlaybackStart = null;
        this.onPlaybackEnd = null;
        this.onProgress = null;
        this.onError = null;
        this.onCrossfadeStart = null;
        this.onCrossfadeEnd = null;

        // Initialize Howler global settings
        Howler.autoUnlock = true;
        Howler.html5PoolSize = 10;
        Howler.usingWebAudio = true;

        // State tracking
        this.state = 'idle'; // idle, loading, playing, paused, crossfading

        console.log('AudioEngine initialized');
    }

    /**
     * Preload audio for a set of hotspots
     */
    async preloadHotspots(hotspots) {
        const audioUrls = hotspots
            .filter(h => h.audioUrl)
            .map(h => ({ id: h.id, url: h.audioUrl }));

        // Add to queue
        this.preloadQueue.push(...audioUrls);

        // Start preloading if not already doing so
        if (!this.isPreloading) {
            this.processPreloadQueue();
        }
    }

    /**
     * Process preload queue
     */
    async processPreloadQueue() {
        this.isPreloading = true;

        while (this.preloadQueue.length > 0 && this.preloadedCount < this.maxPreloadCount) {
            const { id, url } = this.preloadQueue.shift();

            if (!this.sounds.has(id)) {
                await this.loadSound(id, url);
                this.preloadedCount++;
            }
        }

        this.isPreloading = false;
    }

    /**
     * Load a sound (with placeholder fallback)
     */
    async loadSound(id, url) {
        return new Promise((resolve) => {
            // Check if URL exists by trying to load it
            const testAudio = new Audio();
            testAudio.addEventListener('error', () => {
                // Use placeholder if real audio fails
                console.log(`Audio not found for ${id}, using placeholder`);
                this.createSound(id, this.placeholderUrl, true);
                resolve();
            });

            testAudio.addEventListener('canplaythrough', () => {
                // Real audio exists, use it
                this.createSound(id, url, false);
                resolve();
            });

            // Start loading test
            testAudio.src = url;
        });
    }

    /**
     * Create Howl sound object
     */
    createSound(id, url, isPlaceholder = false) {
        const sound = new Howl({
            src: [url],
            html5: true,
            preload: true,
            volume: this.masterVolume,
            onload: () => {
                console.log(`Sound loaded: ${id} (placeholder: ${isPlaceholder})`);
            },
            onend: () => this.handlePlaybackEnd(id),
            onloaderror: (soundId, error) => {
                console.error(`Failed to load sound ${id}:`, error);
                if (this.onError) {
                    this.onError(id, error);
                }
            },
            onplayerror: (soundId, error) => {
                console.error(`Failed to play sound ${id}:`, error);
                if (this.onError) {
                    this.onError(id, error);
                }
            }
        });

        this.sounds.set(id, {
            howl: sound,
            isPlaceholder,
            duration: isPlaceholder ? this.placeholderDuration : null
        });
    }

    /**
     * Play audio for a specific hotspot
     */
    async play(hotspotId) {
        console.log(`Playing audio for hotspot: ${hotspotId}`);

        // If same hotspot, toggle play/pause
        if (this.currentHotspotId === hotspotId && this.currentSound) {
            if (this.isPlaying) {
                this.pause();
            } else {
                this.resume();
            }
            return;
        }

        // Load sound if not already loaded
        if (!this.sounds.has(hotspotId)) {
            this.state = 'loading';
            await this.loadSound(hotspotId, `/audio/hotspot_${hotspotId}.mp3`);
        }

        const soundData = this.sounds.get(hotspotId);
        if (!soundData) {
            console.error(`No sound found for hotspot: ${hotspotId}`);
            return;
        }

        const newSound = soundData.howl;

        // Handle crossfade if enabled and something is playing
        if (this.crossfadeEnabled && this.currentSound && this.isPlaying) {
            this.crossfade(this.currentSound, newSound, hotspotId);
        } else {
            // Direct play
            if (this.currentSound) {
                this.currentSound.stop();
            }

            this.currentSound = newSound;
            this.currentHotspotId = hotspotId;
            this.currentSound.play();
            this.isPlaying = true;
            this.state = 'playing';

            if (this.onPlaybackStart) {
                this.onPlaybackStart(hotspotId);
            }

            // Start progress tracking
            this.startProgressTracking();
        }
    }

    /**
     * Crossfade between two sounds
     */
    crossfade(fromSound, toSound, toHotspotId) {
        if (this.isCrossfading) return;

        console.log(`Crossfading to hotspot: ${toHotspotId}`);

        this.isCrossfading = true;
        this.state = 'crossfading';
        const duration = this.crossfadeDuration;
        const steps = 20;
        const stepDuration = duration / steps;
        let currentStep = 0;

        if (this.onCrossfadeStart) {
            this.onCrossfadeStart(this.currentHotspotId, toHotspotId);
        }

        // Start playing the new sound at volume 0
        toSound.volume(0);
        toSound.play();

        const fadeInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;

            // Fade out old sound
            fromSound.volume(this.masterVolume * (1 - progress));

            // Fade in new sound
            toSound.volume(this.masterVolume * progress);

            if (currentStep >= steps) {
                clearInterval(fadeInterval);

                // Clean up
                fromSound.stop();
                fromSound.volume(this.masterVolume);

                // Update state
                this.previousSound = fromSound;
                this.currentSound = toSound;
                this.currentHotspotId = toHotspotId;
                this.isCrossfading = false;
                this.state = 'playing';

                if (this.onCrossfadeEnd) {
                    this.onCrossfadeEnd(toHotspotId);
                }

                // Restart progress tracking for new sound
                this.startProgressTracking();
            }
        }, stepDuration);
    }

    /**
     * Pause current playback
     */
    pause() {
        if (this.currentSound && this.isPlaying) {
            this.currentSound.pause();
            this.isPlaying = false;
            this.state = 'paused';
            this.stopProgressTracking();
            console.log('Playback paused');
        }
    }

    /**
     * Resume playback
     */
    resume() {
        if (this.currentSound && !this.isPlaying) {
            this.currentSound.play();
            this.isPlaying = true;
            this.state = 'playing';
            this.startProgressTracking();
            console.log('Playback resumed');
        }
    }

    /**
     * Stop all playback
     */
    stop() {
        if (this.currentSound) {
            this.currentSound.stop();
            this.currentSound = null;
            this.currentHotspotId = null;
            this.isPlaying = false;
            this.state = 'idle';
            this.stopProgressTracking();
            console.log('Playback stopped');
        }
    }

    /**
     * Skip forward/backward
     */
    skip(seconds) {
        if (this.currentSound && this.currentSound.playing()) {
            const currentTime = this.currentSound.seek() || 0;
            const duration = this.currentSound.duration();
            const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
            this.currentSound.seek(newTime);
            console.log(`Skipped to ${newTime.toFixed(1)}s`);
        }
    }

    /**
     * Set master volume
     */
    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        Howler.volume(this.masterVolume);
        console.log(`Master volume set to ${(this.masterVolume * 100).toFixed(0)}%`);
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        Howler.mute(this.isMuted);
        console.log(`Audio ${this.isMuted ? 'muted' : 'unmuted'}`);
        return this.isMuted;
    }

    /**
     * Get current playback progress
     */
    getProgress() {
        if (!this.currentSound) return { current: 0, duration: 0, percent: 0 };

        const current = this.currentSound.seek() || 0;
        const soundData = this.sounds.get(this.currentHotspotId);
        const duration = soundData?.isPlaceholder
            ? this.placeholderDuration / 1000
            : this.currentSound.duration() || 0;

        const percent = duration > 0 ? (current / duration) * 100 : 0;

        return { current, duration, percent };
    }

    /**
     * Seek to specific time
     */
    seekTo(timeInSeconds) {
        if (this.currentSound && this.currentSound.playing()) {
            this.currentSound.seek(timeInSeconds);
        }
    }

    /**
     * Seek to percentage
     */
    seekToPercent(percent) {
        if (this.currentSound) {
            const duration = this.currentSound.duration();
            const time = (percent / 100) * duration;
            this.seekTo(time);
        }
    }

    /**
     * Start progress tracking
     */
    startProgressTracking() {
        this.stopProgressTracking();

        this.progressInterval = setInterval(() => {
            if (this.onProgress && this.currentSound && this.isPlaying) {
                const progress = this.getProgress();
                this.onProgress(progress);
            }
        }, 100); // Update every 100ms
    }

    /**
     * Stop progress tracking
     */
    stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    /**
     * Handle playback end
     */
    handlePlaybackEnd(hotspotId) {
        console.log(`Playback ended for hotspot: ${hotspotId}`);

        if (hotspotId === this.currentHotspotId) {
            this.isPlaying = false;
            this.state = 'idle';
            this.stopProgressTracking();

            if (this.onPlaybackEnd) {
                this.onPlaybackEnd(hotspotId);
            }
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            state: this.state,
            isPlaying: this.isPlaying,
            currentHotspotId: this.currentHotspotId,
            isMuted: this.isMuted,
            volume: this.masterVolume,
            isCrossfading: this.isCrossfading,
            preloadedCount: this.sounds.size,
            progress: this.getProgress()
        };
    }

    /**
     * Enable/disable crossfade
     */
    setCrossfade(enabled, duration = 500) {
        this.crossfadeEnabled = enabled;
        this.crossfadeDuration = Math.max(100, Math.min(2000, duration));
        console.log(`Crossfade ${enabled ? 'enabled' : 'disabled'} (${this.crossfadeDuration}ms)`);
    }

    /**
     * Clean up specific sound
     */
    unloadSound(hotspotId) {
        const soundData = this.sounds.get(hotspotId);
        if (soundData) {
            soundData.howl.unload();
            this.sounds.delete(hotspotId);
            this.preloadedCount = Math.max(0, this.preloadedCount - 1);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stop();
        this.stopProgressTracking();

        // Unload all sounds
        this.sounds.forEach((soundData) => {
            soundData.howl.unload();
        });
        this.sounds.clear();

        // Reset state
        this.preloadQueue = [];
        this.preloadedCount = 0;
        this.isPreloading = false;

        console.log('AudioEngine destroyed');
    }
}

export default AudioEngine;