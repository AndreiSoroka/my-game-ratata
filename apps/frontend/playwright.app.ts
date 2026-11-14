import process from 'node:process'

import { defineConfig, devices } from '@playwright/test'

/** Share browser/server settings while destructive source-lifecycle tests get a fresh world. */
export function createAppPlaywrightConfig(
    options: { graveOnly?: boolean; portOffset?: number; graveViewport?: 'desktop' | 'mobile' } = {}
) {
    const graveOnly = options.graveOnly ?? false
    const offset = options.portOffset ?? 0
    const backendPort = readPortEnv('E2E_BACKEND_PORT', 3500, offset)
    const frontendPort = readPortEnv('E2E_FRONTEND_PORT', 5500, offset)
    const phase = graveOnly
        ? `graves${options.graveViewport === undefined ? '' : `-${options.graveViewport}`}`
        : 'app'
    const projects = [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--mute-audio'] } },
        },
        {
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
                launchOptions: { firefoxUserPrefs: { 'media.volume_scale': '0.0' } },
            },
        },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ]
    return defineConfig({
        testDir: './e2e',
        testMatch: graveOnly ? '**/grave-interaction.spec.ts' : '**/*.spec.ts',
        testIgnore: graveOnly
            ? '**/*.visual.spec.ts'
            : ['**/*.visual.spec.ts', '**/grave-interaction.spec.ts'],
        ...(options.graveViewport === undefined
            ? {}
            : { grep: new RegExp(`\\(${options.graveViewport}\\)$`) }),
        timeout: 30_000,
        expect: { timeout: 5_000 },
        forbidOnly: Boolean(process.env.CI),
        retries: process.env.CI ? 2 : 0,
        // Sequential WebGL pages avoid competing software renderers during cold startup.
        workers: 1,
        outputDir: `test-results/${phase}`,
        reporter: [['html', { outputFolder: `playwright-report/${phase}` }]],
        use: {
            actionTimeout: 0,
            baseURL: `http://127.0.0.1:${String(frontendPort)}`,
            trace: 'on-first-retry',
            headless: true,
        },
        // Grave lifecycle covers desktop/mobile Chromium once in its own fresh world.
        projects: graveOnly ? projects.slice(0, 1) : projects,
        webServer: [
            {
                // No watch: a source/test-file write must not reset an ongoing test world.
                command: `PORT=${String(backendPort)} bun run --cwd ../backend start`,
                port: backendPort,
                reuseExistingServer: false,
            },
            {
                command: `VITE_GAME_AUDIO_MUTED=1 VITE_BACKEND_WS_URL=ws://127.0.0.1:${String(backendPort)}/ws bun run dev -- --port ${String(frontendPort)}`,
                port: frontendPort,
                reuseExistingServer: false,
            },
        ],
    })
}

function readPortEnv(name: string, fallback: number, offset: number): number {
    const raw = process.env[name]
    const port = (raw === undefined || raw.length === 0 ? fallback : Number(raw)) + offset
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new Error(`Invalid ${name} with offset ${String(offset)}: ${String(raw ?? fallback)}`)
    }
    return port
}
