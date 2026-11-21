import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import type { ChatHistoryEntry, ChatHistoryFilter } from '@/entities/chats'
import { renderVueStory } from '@/shared/lib/storybook'

import ChatWidget from './ChatWidget.vue'

interface StoryArgs {
    entries: readonly ChatHistoryEntry[]
    filter: ChatHistoryFilter
    collapsed: boolean
    typing: boolean
    draft: string
    maxLength: number
}

const meta = {
    title: 'Widgets/Chats/ChatWidget',
    args: {
        entries: [
            { id: 'gates', channel: 'say', name: 'Мира', text: 'Встретимся у ворот.', at: 1 },
            {
                id: 'whisper',
                channel: 'whisper',
                name: 'Лада',
                partnerName: 'Лада',
                text: 'Карту оставила у фонаря.',
                at: 2,
            },
        ],
        filter: 'all',
        collapsed: false,
        typing: true,
        draft: 'Я уже в пути.',
        maxLength: 400,
    },
    argTypes: {
        entries: { control: 'object' },
        filter: { control: 'inline-radio', options: ['all', 'say', 'whisper'] },
        collapsed: { control: 'boolean' },
        typing: { control: 'boolean' },
        draft: { control: 'text' },
        maxLength: { control: { type: 'number', min: 1, step: 1 } },
    },
    render(args) {
        const host = renderVueStory(
            {
                setup() {
                    const draft = ref(args.draft)
                    const filter = ref(args.filter)
                    const collapsed = ref(args.collapsed)
                    return () =>
                        h(ChatWidget, {
                            ...args,
                            style: { display: 'grid', gap: '8px' },
                            draft: draft.value,
                            filter: filter.value,
                            collapsed: collapsed.value,
                            'onUpdate:draft': (value: string) => (draft.value = value),
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

export const Reading: Story = { args: { typing: false } }

export const Collapsed: Story = { args: { typing: false, collapsed: true } }
