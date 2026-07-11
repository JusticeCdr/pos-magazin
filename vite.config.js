import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Build electron/main.js → dist-electron/main.js
        // Electron is launched automatically by vite-plugin-electron
        entry: 'electron/main.js',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['node:sqlite', 'ngrok', 'selfsigned'],
            },
          },
        },
      },
      {
        // Build electron/preload.js → dist-electron/preload.js
        // Reload renderer when preload is rebuilt during dev
        entry: 'electron/preload.js',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['node:sqlite', 'ngrok', 'selfsigned'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    rollupOptions: {
      external: ['node:sqlite', 'ngrok', 'selfsigned'],
    },
  },
})
