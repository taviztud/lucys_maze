import { defineConfig } from 'vite';

export default defineConfig({
    base: '/lucys_maze/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true,
        rollupOptions: {
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
    }
});
