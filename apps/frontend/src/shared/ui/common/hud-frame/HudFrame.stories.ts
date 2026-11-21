import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import HudFrame from './HudFrame.vue'

const meta = { title: 'Shared/Common/HudFrame' } satisfies Meta
export default meta
export const Default: StoryObj = {
    render: () =>
        renderVueStory(
            {
                render: () =>
                    h(HudFrame, { style: { width: '300px' } }, () =>
                        h('div', { style: { padding: '8px 12px 10px' } }, 'Статус игрока')
                    ),
            },
            {}
        ),
}
