import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [vue()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true
  }
})
