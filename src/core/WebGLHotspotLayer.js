import WebGLVectorLayerRenderer from 'ol/renderer/webgl/VectorLayer.js';
import { Fill, Stroke } from 'ol/style.js';
import { packColor } from 'ol/renderer/webgl/shaders.js';

/**
 * WebGL Hotspot Layer - Optimized for rendering 600+ hotspots
 * Uses WebGL for maximum performance
 */
class WebGLHotspotLayer {
    constructor(vectorSource) {
        this.source = vectorSource;

        // Define styles for WebGL
        this.styles = {
            'audio_only': {
                'fill-color': packColor([0, 203, 244, 0.3 * 255]),
                'stroke-color': '#00cbf4',
                'stroke-width': 1
            },
            'audio_link': {
                'fill-color': packColor([73, 243, 0, 0.3 * 255]),
                'stroke-color': '#49f300',
                'stroke-width': 1
            },
            'audio_image': {
                'fill-color': packColor([255, 5, 247, 0.3 * 255]),
                'stroke-color': '#ff05f7',
                'stroke-width': 1
            },
            'audio_image_link': {
                'fill-color': packColor([255, 93, 0, 0.3 * 255]),
                'stroke-color': '#ff5d00',
                'stroke-width': 1
            },
            'audio_sound': {
                'fill-color': packColor([255, 176, 0, 0.3 * 255]),
                'stroke-color': '#ffb000',
                'stroke-width': 1
            }
        };
    }

    /**
     * Create WebGL style function
     */
    createWebGLStyle() {
        return {
            'fill-color': (feature) => {
                const type = feature.get('type') || 'audio_only';
                return this.styles[type]['fill-color'];
            },
            'stroke-color': (feature) => {
                const type = feature.get('type') || 'audio_only';
                return this.styles[type]['stroke-color'];
            },
            'stroke-width': (feature) => {
                const type = feature.get('type') || 'audio_only';
                return this.styles[type]['stroke-width'];
            },
            'opacity': 1,
            'z-index': 0
        };
    }

    /**
     * Create optimized WebGL renderer configuration
     */
    getRendererConfig() {
        return {
            className: 'ol-layer-webgl',
            uniforms: {
                u_opacity: 1.0,
                u_time: 0.0
            },
            postProcesses: []
        };
    }
}

export default WebGLHotspotLayer;