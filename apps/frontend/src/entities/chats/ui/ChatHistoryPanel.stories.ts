import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import type { ChatHistoryEntry, ChatHistoryFilter } from '../model/chatHistory'
import ChatHistoryPanel from './ChatHistoryPanel.vue'

interface StoryArgs {
    entries: readonly ChatHistoryEntry[]
    filter: ChatHistoryFilter
    collapsed: boolean
    listId?: string
}

const entries = [
    { id: 'gates', channel: 'say', name: 'Мира', text: 'Встретимся у северных ворот.', at: 1 },
    {
        id: 'whisper',
        channel: 'whisper',
        name: 'Лада',
        partnerName: 'Лада',
        text: 'Карту оставила у фонаря.',
        at: 2,
    },
    { id: 'request', channel: 'status', name: 'Лада', text: 'Поручение принято', at: 3 },
] satisfies ChatHistoryEntry[]

const meta = {
    title: 'Entities/chats/ChatHistoryPanel',
    args: { entries, filter: 'all', collapsed: false },
    argTypes: {
        entries: { control: 'object' },
        filter: { control: 'inline-radio', options: ['all', 'say', 'whisper'] },
        collapsed: { control: 'boolean' },
        listId: { control: 'text' },
    },
    render(args) {
        const host = renderVueStory(ChatHistoryPanel, {
            ...args,
            style: { maxBlockSize: '210px' },
        })
        host.style.maxWidth = '418px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Empty: Story = { args: { entries: [] } }

export const Collapsed: Story = { args: { collapsed: true } }

export const Private: Story = { args: { filter: 'whisper' } }

export const Translated: Story = {
    args: {
        entries: [
            {
                id: 'translated',
                channel: 'say',
                name: 'Mira',
                language: 'en',
                text: 'Meet me at the north gate.',
                translation: { locale: 'ru', text: 'Встретимся у северных ворот.' },
                at: 1,
            },
        ],
    },
}

export const LongHistory: Story = {
    args: {
        entries: [
            ...Array.from({ length: 14 }, (_, index): ChatHistoryEntry => ({
                id: `road-${index}`,
                channel: 'say',
                name: 'Дозорный',
                text: `Донесение ${index + 1}. На северной дороге тихо.`,
                at: index + 1,
            })),
            {
                id: 'note',
                channel: 'say',
                name: 'Мира',
                text: 'После заката переправу не охраняют.\nОстанемся у старой мельницы до утра.',
                at: 15,
            },
        ],
    },
}
