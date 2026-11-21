import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import HudFrame from './HudFrame.vue'

interface StoryArgs {
    content: 'text' | 'empty'
}

const meta = {
    title: 'Shared/Common/HudFrame',
    args: { content: 'text' },
    argTypes: {
        content: {
            name: 'Содержимое слота',
            control: { type: 'select', labels: { text: 'Текст', empty: 'Пустой div' } },
            options: ['text', 'empty'],
        },
    },
} satisfies Meta<StoryArgs>
export default meta
export const Default: StoryObj<StoryArgs> = {
    render: ({ content }) => {
        const host = renderVueStory(
            {
                render: () =>
                    h(HudFrame, null, () => (content === 'empty' ? h('div') : 'Статус игрока')),
            },
            {}
        )
        host.style.maxWidth = '348px'
        return host
    },
}
