import { Howl, Howler } from 'howler';

/**
 * AudioEngine - Manages audio playback with sub-150ms latency
 * Uses Howler.js for cross-browser compatibility and preloading
 */
class AudioEngine {
    constructor() {
        this.sounds = new Map();
        this.currentSound = null;
        this.isPreloading = false;
        this.preloadQueue = [];

        // Event callbacks
        this.onPlaybackEnd = null;
        this.onPlaybackStart = null;
        this.onProgress = null;

        // Initialize Howler global settings
        Howler.autoUnlock = true;
        Howler.html5PoolSize = 10;
    }

    /**
     * Preload audio for a set of hotspots
     */
    async preloadHotspots(hotspots) {
        // TEMPORAIRE - Désactiver le préchargement jusqu'à avoir de vrais fichiers audio
        return;

        /* Code original commenté pour plus tard
        const audioUrls = hotspots
            .filter(h => h.audioUrl)
            .map(h => ({ id: h.id, url: h.audioUrl }));
    
        this.isPreloading = true;
    
        for (const { id, url } of audioUrls) {
            if (!this.sounds.has(id)) {
                const sound = new Howl({
                    src: [url],
                    html5: true,
                    preload: true,
                    onend: () => this.handlePlaybackEnd(id)
                });
    
                this.sounds.set(id, sound);
            }
        }
    
        this.isPreloading = false;
        */
    }

    /**
     * Play audio for a specific hotspot
     */
    play(hotspotId) {
        // Stop current sound if playing
        if (this.currentSound) {
            this.currentSound.stop();
        }

        const sound = this.sounds.get(hotspotId);
        if (sound) {
            this.currentSound = sound;
            sound.play();

            if (this.onPlaybackStart) {
                this.onPlaybackStart(hotspotId);
            }
        }
    }

    /**
     * Pause current playback
     */
    pause() {
        if (this.currentSound) {
            this.currentSound.pause();
        }
    }

    /**
     * Resume playback
     */
    resume() {
        if (this.currentSound) {
            this.currentSound.play();
        }
    }

    /**
     * Stop all playback
     */
    stop() {
        if (this.currentSound) {
            this.currentSound.stop();
            this.currentSound = null;
        }
    }

    /**
     * Skip forward/backward
     */
    skip(seconds) {
        if (this.currentSound) {
            const currentTime = this.currentSound.seek();
            const duration = this.currentSound.duration();
            const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
            this.currentSound.seek(newTime);
        }
    }

    /**
     * Get current playback progress
     */
    getProgress() {
        if (!this.currentSound) return { current: 0, duration: 0, percent: 0 };

        const current = this.currentSound.seek();
        const duration = this.currentSound.duration();
        const percent = duration > 0 ? (current / duration) * 100 : 0;

        return { current, duration, percent };
    }

    /**
     * Handle playback end
     */
    handlePlaybackEnd(hotspotId) {
        if (this.onPlaybackEnd) {
            this.onPlaybackEnd(hotspotId);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stop();
        this.sounds.forEach(sound => sound.unload());
        this.sounds.clear();
    }
}

export default AudioEngine;