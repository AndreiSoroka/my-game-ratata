import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

import { GameBar } from '../game-bar'
import HudFrame from './HudFrame.vue'

interface StoryArgs {
    border: FantasyBorderVariant
    content: StorySlot
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
        content: storySlotControl('Содержимое слота'),
    },
} satisfies Meta<StoryArgs>
export default meta
export const Default: StoryObj<StoryArgs> = {
    render: ({ border, content }) => {
        const host = renderVueStory(
            {
                render: () =>
                    h(
                        HudFrame,
                        { border },
                        {
                            default: storySlot(content, 'Статус игрока', () =>
                                h(GameBar, { value: 72, label: 'Здоровье', height: 18 })
                            ),
                        }
                    ),
            },
            {}
        )
        host.style.maxWidth = '348px'
        return host
    },
}
