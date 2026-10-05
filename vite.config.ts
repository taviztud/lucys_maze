/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteAssetApi } from './scripts/plugins/vite-asset-api';

export default defineConfig({
    base: './',
    plugins: [
        viteAssetApi()
    ],
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                studio: resolve(__dirname, 'studio/index.html')
            },
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        }
    },
    server: {
        port: 8080,
        open: true
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts']
    }
});
