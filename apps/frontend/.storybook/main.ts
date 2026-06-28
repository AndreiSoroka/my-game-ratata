import { fileURLToPath, URL } from 'node:url'

import { defineMain } from '@storybook/web-components-vite/node'
import { mergeConfig } from 'vite'

export default defineMain({
    framework: '@storybook/web-components-vite',
    stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
    async viteFinal(config) {
        return mergeConfig(config, {
            resolve: {
                alias: {
                    '@': fileURLToPath(new URL('../src', import.meta.url)),
                    '@my-game-ratata/contracts': fileURLToPath(
                        new URL('../../../contracts/src/index.ts', import.meta.url)
                    ),
                },
            },
        })
    },
})
