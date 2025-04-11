import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Ensure this matches tsconfig.app.json structure
      '@shared': path.resolve(__dirname, '../../sidebar-extension/shared'),
      '@': path.resolve(__dirname, './src')
    }
  }
})
