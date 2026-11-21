import type { SoulSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import SoulBadge from './SoulBadge.vue'

type StoryArgs = { soul?: SoulSnapshot }

const meta = {
    title: 'Entities/player-effects/SoulBadge',
    args: {
        soul: {
            kind: 'spark',
            controlSource: 'human',
            canSpeak: true,
        },
    },
    argTypes: { soul: { control: 'object' } },
    render: (args) => renderVueStory(SoulBadge, args, { background: 'var(--vt-c-black-soft)' }),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Echo: Story = {
    args: {
        soul: {
            kind: 'echo',
            controlSource: 'script',
            canSpeak: false,
        },
    },
}
