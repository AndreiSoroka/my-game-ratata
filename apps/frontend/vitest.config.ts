import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'

import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: 'jsdom',
            exclude: [...configDefaults.exclude, 'e2e/**'],
            maxWorkers: Math.min(3, availableParallelism()),
            root: fileURLToPath(new URL('./', import.meta.url)),
        },
    })
)
