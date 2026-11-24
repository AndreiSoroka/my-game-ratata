import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import JoinAssetCredits from './JoinAssetCredits.vue'

const meta = {
    title: 'Entities/asset-credits/JoinAssetCredits',
    render() {
        const host = renderVueStory(
            JoinAssetCredits,
            {},
            { background: 'var(--ui-dark-panel-surface)' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '400px'
        return host
    },
} satisfies Meta

export default meta

export const Default: StoryObj<typeof meta> = {}
