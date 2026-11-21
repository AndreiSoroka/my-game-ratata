import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import SoulSpeechIcon from './SoulSpeechIcon.vue'

type StoryArgs = { isCanSpeak?: boolean }

const meta = {
    title: 'Entities/Player effects/SoulSpeechIcon',
    argTypes: { isCanSpeak: { control: 'boolean' } },
    render(args) {
        const host = renderVueStory(SoulSpeechIcon, args, {
            background: 'var(--ui-dark-panel-surface)',
        })
        host.style.color = 'var(--ui-dark-panel-title)'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const CanSpeak: Story = { args: { isCanSpeak: true } }

export const CannotSpeak: Story = { args: { isCanSpeak: false } }
