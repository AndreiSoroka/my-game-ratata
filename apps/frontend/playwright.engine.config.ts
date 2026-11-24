import { defineConfig, devices } from '@playwright/test'

const port = 5600
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
    testDir: './e2e/engine',
    testMatch: '**/engine.test.ts',
    timeout: 30_000,
    workers: 1,
    outputDir: 'test-results/engine',
    reporter: [['html', { outputFolder: 'playwright-report/engine', open: 'never' }]],
    use: {
        ...devices['Desktop Chrome'],
        baseURL,
        deviceScaleFactor: 1,
        headless: true,
        launchOptions: { args: ['--mute-audio'] },
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: `bun run dev -- --port ${port} --strictPort`,
        env: { VITE_GAME_AUDIO_MUTED: '0' },
        port,
        reuseExistingServer: false,
    },
})
