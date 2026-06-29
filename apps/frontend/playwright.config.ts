import process from 'node:process'

import { defineConfig, devices } from '@playwright/test'

const backendPort = readPortEnv('E2E_BACKEND_PORT', 3000)
const frontendPort = readPortEnv('E2E_FRONTEND_PORT', 5173)
const backendWsUrl = `ws://127.0.0.1:${String(backendPort)}/ws`
const frontendBaseUrl = `http://127.0.0.1:${String(frontendPort)}`

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './e2e',
    testIgnore: '**/*.visual.spec.ts',
    /* Maximum time one test can run for. */
    timeout: 30 * 1000,
    expect: {
        /**
         * Maximum time expect() should wait for the condition to be met.
         * For example in `await expect(locator).toHaveText();`
         */
        timeout: 5000,
    },
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: Boolean(process.env.CI),
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
        actionTimeout: 0,
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: frontendBaseUrl,

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',

        /* Run Playwright headless by default; use headed mode only for explicit visual debugging. */
        headless: true,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
        {
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
            },
        },
        {
            name: 'webkit',
            use: {
                ...devices['Desktop Safari'],
            },
        },

        /* Test against mobile viewports. */
        // {
        //   name: 'Mobile Chrome',
        //   use: {
        //     ...devices['Pixel 5'],
        //   },
        // },
        // {
        //   name: 'Mobile Safari',
        //   use: {
        //     ...devices['iPhone 12'],
        //   },
        // },

        /* Test against branded browsers. */
        // {
        //   name: 'Microsoft Edge',
        //   use: {
        //     channel: 'msedge',
        //   },
        // },
        // {
        //   name: 'Google Chrome',
        //   use: {
        //     channel: 'chrome',
        //   },
        // },
    ],

    /* Folder for test artifacts such as screenshots, videos, traces, etc. */
    // outputDir: 'test-results/',

    /* Run your local dev server before starting the tests */
    webServer: [
        {
            command: `PORT=${String(backendPort)} bun run --cwd ../backend dev`,
            port: backendPort,
            reuseExistingServer: !process.env.CI,
        },
        {
            /**
             * Use the dev server so VITE_BACKEND_WS_URL points at the paired backend.
             * Playwright will re-use local servers if they are already running.
             */
            command: `VITE_BACKEND_WS_URL=${backendWsUrl} bun run dev -- --port ${String(frontendPort)}`,
            port: frontendPort,
            reuseExistingServer: !process.env.CI,
        },
    ],
})

function readPortEnv(name: string, fallback: number): number {
    const raw = process.env[name]

    if (raw === undefined || raw.length === 0) {
        return fallback
    }

    const port = Number(raw)

    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`Invalid ${name} value: ${raw}`)
    }

    return port
}
