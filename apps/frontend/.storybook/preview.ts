/// <reference types="vite/client" />

import '../src/assets/base.css'

import type { Preview } from '@storybook/web-components-vite'

import { lightUiColors } from '../src/shared/ui/theme'

function canvasColor(reference: string): string {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(reference.slice(4, -1))
        .trim()
    return value || reference
}

const preview: Preview = {
    initialGlobals: {
        backgrounds: { value: 'wood', grid: false },
    },
    parameters: {
        backgrounds: {
            disable: true,
            options: {
                wood: { name: 'Wood', value: canvasColor(lightUiColors.button.wood.bottom) },
                parchment: { name: 'Parchment', value: canvasColor(lightUiColors.panel.parchment) },
                dark: { name: 'Dark', value: canvasColor('var(--vt-c-black-soft)') },
            },
        },
        a11y: {
            test: 'todo',
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        layout: 'fullscreen',
    },
}

export default preview
