import process from 'node:process'

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.visual.spec.ts',
    timeout: 30 * 1000,
    expect: {
        timeout: 10 * 1000,
    },
    forbidOnly: Boolean(process.env.CI),
    outputDir: 'test-results/storybook',
    reporter: [['html', { outputFolder: 'playwright-report/storybook' }]],
    use: {
        baseURL: 'http://127.0.0.1:6006',
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
        command:
            'node node_modules/storybook/dist/bin/dispatcher.js dev -p 6006 -h 127.0.0.1 --ci --no-open',
        reuseExistingServer: true,
        timeout: 60 * 1000,
        url: 'http://127.0.0.1:6006/',
    },
})
