import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/programs': 'http://localhost:3001',
      '/build': 'http://localhost:3001',
      '/download': 'http://localhost:3001',
    },
  },
});
