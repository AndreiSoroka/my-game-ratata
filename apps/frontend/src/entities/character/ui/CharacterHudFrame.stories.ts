import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import CharacterHudFrame from './CharacterHudFrame.vue'

const meta = { title: 'Entities/Character/HUD frame' } satisfies Meta
export default meta
type Story = StoryObj

function renderFrame(width: number, compact = false): HTMLElement {
    return renderVueStory(
        {
            render: () =>
                h(CharacterHudFrame, { compact, style: { width: `${width}px` } }, () =>
                    h('div', { style: { padding: '8px 12px 10px' } }, 'Статус игрока')
                ),
        },
        {}
    )
}

export const Default: Story = { render: () => renderFrame(300) }

export const Compact: Story = { render: () => renderFrame(150, true) }
