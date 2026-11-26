import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@my-game-ratata/contracts': fileURLToPath(
                new URL('../../contracts/src/index.ts', import.meta.url)
            ),
        },
    },
    test: {
        clearMocks: true,
        environment: 'node',
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        maxWorkers: Math.min(3, availableParallelism()),
        restoreMocks: true,
        // Advancing fake game time still runs real room ticks and sends snapshots.
        testTimeout: 15_000,
    },
})
