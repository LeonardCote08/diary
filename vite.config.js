import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
    plugins: [solid()],
    server: {
        port: 3000,
        open: true,
        host: true
    },
    build: {
        // Ensure assets are copied correctly
        assetsDir: 'assets',
        rollupOptions: {
            output: {
                // Keep consistent file names for caching
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]'
            }
        }
    }
})