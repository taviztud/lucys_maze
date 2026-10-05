import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;
// E2E_PREVIEW=1 runs the suite against the production build (`npm run build` first).
const usePreview = Boolean(process.env.E2E_PREVIEW);

export default defineConfig({
    testDir: './e2e',
    outputDir: './test-results/e2e',
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    expect: { timeout: 10_000 },
    reporter: [['list']],
    use: {
        baseURL: `http://localhost:${PORT}/`,
        trace: 'retain-on-failure'
    },
    projects: [
        {
            name: 'mobile-chromium',
            use: { ...devices['Pixel 7'] }
        }
    ],
    webServer: {
        command: `npx vite ${usePreview ? 'preview' : ''} --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: !process.env.CI && !usePreview,
        // vite.config.ts opens a browser tab on start; keep the test server headless.
        env: { BROWSER: 'none' },
        timeout: 60_000
    }
});
