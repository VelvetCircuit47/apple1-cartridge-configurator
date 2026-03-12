import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Dedicated build config for the Apple-1 Cartridge emulator.
// Served under /emulator/ so base must match.
export default defineConfig({
    plugins: [react()],
    base: '/emulator/',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    worker: {
        format: 'es',
        rollupOptions: {
            output: {
                entryFileNames: 'worker-[name].[hash].js',
            },
        },
    },
    build: {
        outDir: 'dist-cartridge',
        sourcemap: false,
        rollupOptions: {
            input: {
                cartridge: path.resolve(__dirname, 'index-cartridge.html'),
            },
        },
    },
});
