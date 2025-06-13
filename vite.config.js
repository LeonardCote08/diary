import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
    plugins: [solid()],
    server: {
        port: 3000,
        open: true
    },
    define: {
        global: 'globalThis',
    },
    optimizeDeps: {
        include: [
            'ol/Map',
            'ol/View',
            'ol/layer/Tile',
            'ol/layer/Vector',
            'ol/source/Vector',
            'ol/source/ImageTile',
            'ol/tilegrid/TileGrid',
            'ol/Feature',
            'ol/geom/Polygon',
            'ol/geom/MultiPolygon',
            'ol/style/Style',
            'ol/style/Fill',
            'ol/style/Stroke',
            'ol/extent',
            'ol/interaction',
            'ol/control',
            'ol/Kinetic'
        ]
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'openlayers-core': [
                        'ol/Map',
                        'ol/View',
                        'ol/extent',
                        'ol/proj'
                    ],
                    'openlayers-layers': [
                        'ol/layer/Tile',
                        'ol/layer/Vector',
                        'ol/layer/VectorImage'
                    ],
                    'openlayers-sources': [
                        'ol/source/ImageTile',
                        'ol/source/Vector',
                        'ol/tilegrid/TileGrid'
                    ],
                    'openlayers-geometry': [
                        'ol/Feature',
                        'ol/geom/Polygon',
                        'ol/geom/MultiPolygon'
                    ],
                    'openlayers-style': [
                        'ol/style/Style',
                        'ol/style/Fill',
                        'ol/style/Stroke'
                    ],
                    'openlayers-interaction': [
                        'ol/interaction',
                        'ol/control',
                        'ol/Kinetic'
                    ]
                }
            }
        }
    }
})