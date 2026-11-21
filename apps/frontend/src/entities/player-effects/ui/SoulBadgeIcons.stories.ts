import type { SoulKind } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import SoulBadgeIcons from './SoulBadgeIcons.vue'

type StoryArgs = { soulKind?: SoulKind; isCanSpeak?: boolean }

const meta = {
    title: 'Entities/Player effects/Soul badge icons',
    argTypes: {
        soulKind: { control: 'inline-radio', options: ['spark', 'echo'] },
        isCanSpeak: { control: 'boolean' },
    },
    render(args) {
        const host = renderVueStory(SoulBadgeIcons, args, {
            background: 'var(--ui-dark-panel-surface)',
        })
        host.style.color = 'var(--ui-dark-panel-title)'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Spark: Story = { args: { soulKind: 'spark', isCanSpeak: true } }

export const SilentEcho: Story = { args: { soulKind: 'echo', isCanSpeak: false } }

export const UnknownSpeech: Story = { args: { soulKind: 'echo' } }
