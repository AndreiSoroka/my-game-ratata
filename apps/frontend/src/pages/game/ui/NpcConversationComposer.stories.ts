import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import NpcConversationComposer from './NpcConversationComposer.vue'

interface StoryArgs {
    targetId: string
    waiting: boolean
}

const meta = {
    title: 'Pages/Game/NpcConversationComposer',
    args: { targetId: 'npc_herbalist_1', waiting: false },
    argTypes: { targetId: { control: 'text' }, waiting: { control: 'boolean' } },
    render(args) {
        const host = renderVueStory(NpcConversationComposer, { ...args }, { background: '#172820' })
        host.style.color = '#f2efdf'
        host.style.maxWidth = '500px'
        return host
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Waiting: Story = { args: { waiting: true } }
