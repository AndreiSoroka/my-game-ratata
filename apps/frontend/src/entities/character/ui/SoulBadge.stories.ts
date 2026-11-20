import type { SoulKind } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import SoulBadge from './SoulBadge.vue'

type StoryArgs = { soulKind: SoulKind; isCanSpeak?: boolean; compact?: boolean }

const meta = {
    title: 'Entities/Character/Soul badge',
    args: { soulKind: 'spark', isCanSpeak: true, compact: false },
    render: (args) => renderVueStory(SoulBadge, args, { background: 'var(--vt-c-black-soft)' }),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Spark: Story = {}

export const Echo: Story = { args: { soulKind: 'echo', isCanSpeak: false } }

export const Compact: Story = { args: { compact: true } }
