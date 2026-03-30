import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@images': path.resolve(__dirname, './images'),
      '@chatbot_image': path.resolve(__dirname, './chatbot_image'),
    }
  },
  build: {
    outDir: 'dist'
  }
})
