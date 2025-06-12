import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
    plugins: [solid()],
    server: {
        port: 3000, // Utiliser le port 3000 au lieu de 5173
        open: true  // Ouvrir automatiquement le navigateur
    }
})