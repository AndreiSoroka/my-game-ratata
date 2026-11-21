import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

import HudFrame from './HudFrame.vue'

interface StoryArgs {
    border: FantasyBorderVariant
    content: 'text' | 'empty'
}

const meta = {
    title: 'Shared/Common/HudFrame',
    args: { border: 'border-017', content: 'text' },
    argTypes: {
        border: {
            control: 'select',
            options: Array.from(
                { length: 32 },
                (_, index) => `border-${String(index).padStart(3, '0')}`
            ),
        },
        content: {
            name: 'Содержимое слота',
            control: { type: 'select', labels: { text: 'Текст', empty: 'Пустой div' } },
            options: ['text', 'empty'],
        },
    },
} satisfies Meta<StoryArgs>
export default meta
export const Default: StoryObj<StoryArgs> = {
    render: ({ border, content }) => {
        const host = renderVueStory(
            {
                render: () =>
                    h(HudFrame, { border }, () =>
                        content === 'empty' ? h('div') : 'Статус игрока'
                    ),
            },
            {}
        )
        host.style.maxWidth = '348px'
        return host
    },
}
