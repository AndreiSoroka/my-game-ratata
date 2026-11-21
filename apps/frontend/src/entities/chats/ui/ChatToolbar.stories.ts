import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { ChatHistoryFilter } from '../model/chatHistory'
import ChatToolbar from './ChatToolbar.vue'

interface StoryArgs {
    filter: ChatHistoryFilter
    collapsed: boolean
    historyId?: string
}

const meta = {
    title: 'Entities/chats/ChatToolbar',
    args: { filter: 'all', collapsed: false },
    argTypes: {
        filter: { control: 'inline-radio', options: ['all', 'say', 'whisper'] },
        collapsed: { control: 'boolean' },
        historyId: { control: 'text' },
    },
    render(args) {
        const host = renderVueStory(
            {
                setup() {
                    const filter = ref(args.filter)
                    const collapsed = ref(args.collapsed)
                    return () =>
                        h(ChatToolbar, {
                            historyId: args.historyId,
                            filter: filter.value,
                            collapsed: collapsed.value,
                            'onUpdate:filter': (value: ChatHistoryFilter) => (filter.value = value),
                            'onUpdate:collapsed': (value: boolean) => (collapsed.value = value),
                        })
                },
            },
            {}
        )
        host.style.maxWidth = '418px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Collapsed: Story = { args: { collapsed: true } }
