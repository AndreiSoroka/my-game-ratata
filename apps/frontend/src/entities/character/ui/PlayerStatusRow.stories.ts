import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { GameBar } from '@/shared/ui/common/game-bar'
import { lightUiColors } from '@/shared/ui/theme'

import PlayerStatusRow from './PlayerStatusRow.vue'

interface StoryArgs {
    align: 'start' | 'center'
    leading: string
    content?: string
    trailing?: string
    width: number
}

const meta = {
    title: 'Entities/Character/Player status row',
    args: { align: 'center', leading: 'HP', width: 330 },
    argTypes: { align: { control: 'inline-radio', options: ['start', 'center'] } },
    render(args) {
        const host = renderVueStory(
            {
                render: () =>
                    h(
                        PlayerStatusRow,
                        { align: args.align },
                        {
                            leading: () => args.leading,
                            default: () =>
                                args.content ??
                                h(GameBar, { value: 72, label: 'Health', height: 18 }),
                            ...(args.trailing ? { trailing: () => args.trailing } : {}),
                        }
                    ),
            },
            {},
            { background: lightUiColors.panel.parchment }
        )
        host.style.maxWidth = `${args.width}px`
        host.style.containerType = 'inline-size'
        host.style.color = lightUiColors.panel.text
        host.style.font = '12px/1.4 var(--ratata-font-family, sans-serif)'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Resource: Story = {}

export const CompactWithTrailing: Story = {
    args: {
        align: 'start',
        leading: '✦',
        content: 'Покровитель и развитие',
        trailing: '3',
        width: 180,
    },
}
