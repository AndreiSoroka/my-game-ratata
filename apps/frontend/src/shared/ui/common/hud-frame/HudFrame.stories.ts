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
                    h(HudFrame, { style: { width: 'min(300px, 100%)' } }, () => 'Статус игрока'),
            },
            {}
        ),
}
