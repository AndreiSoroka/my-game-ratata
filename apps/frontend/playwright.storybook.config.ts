import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const serverPort = Number(process.env['E2E_STORYBOOK_PORT'] ?? '6006')
if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65_535) {
    throw new Error(`Invalid E2E_STORYBOOK_PORT: ${serverPort}`)
}
const storybookUrl = `http://127.0.0.1:${serverPort}`

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.visual.spec.ts',
    timeout: 30 * 1000,
    expect: {
        timeout: 10 * 1000,
        toHaveScreenshot: {
            stylePath: fileURLToPath(new URL('./e2e/visual-screenshot.css', import.meta.url)),
        },
    },
    forbidOnly: Boolean(process.env.CI),
    outputDir: 'test-results/storybook',
    reporter: [['html', { outputFolder: 'playwright-report/storybook' }]],
    use: {
        launchOptions: { args: ['--mute-audio'] },
        baseURL: storybookUrl,
        deviceScaleFactor: 1,
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
        viewport: {
            height: 900,
            width: 1280,
        },
    },
    projects: [
        {
            name: 'chromium-storybook',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
    webServer: {
        command: `VITE_GAME_AUDIO_MUTED=1 node node_modules/storybook/dist/bin/dispatcher.js dev -p ${serverPort} -h 127.0.0.1 --ci --no-open`,
        reuseExistingServer: true,
        timeout: 60 * 1000,
        url: storybookUrl,
    },
})
