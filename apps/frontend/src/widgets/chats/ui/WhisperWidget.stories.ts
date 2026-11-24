import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import type { ChatHistoryEntry } from '@/entities/chats'
import { renderVueStory } from '@/shared/lib/storybook'

import WhisperWidget from './WhisperWidget.vue'

interface StoryArgs {
    entries: readonly ChatHistoryEntry[]
    partnerName: string
    available: boolean
    draft: string
    maxLength: number
}

const entries = [
    {
        id: 'gates',
        channel: 'whisper',
        name: 'Мира',
        text: 'Я подожду у северных ворот.',
        at: 1,
    },
    {
        id: 'reply',
        channel: 'whisper',
        name: 'Вы',
        self: true,
        text: 'Договорились.',
        at: 2,
    },
] satisfies ChatHistoryEntry[]

const meta = {
    title: 'Widgets/Chats/WhisperWidget',
    args: { entries, partnerName: 'Мира', available: true, draft: 'Я уже в пути.', maxLength: 400 },
    argTypes: {
        entries: { control: 'object' },
        partnerName: { control: 'text' },
        available: { control: 'boolean' },
        draft: { control: 'text' },
        maxLength: { control: { type: 'number', min: 1, step: 1 } },
    },
    render(args) {
        const host = renderVueStory(
            {
                setup() {
                    const draft = ref(args.draft)
                    const entries = ref([...args.entries])
                    function send(text: string): void {
                        const at = entries.value.length + 1
                        entries.value.push({
                            id: `sent-${at}`,
                            channel: 'whisper',
                            name: 'Вы',
                            self: true,
                            text,
                            at,
                        })
                        draft.value = ''
                    }
                    return () =>
                        h(WhisperWidget, {
                            ...args,
                            draft: draft.value,
                            entries: entries.value,
                            'onUpdate:draft': (value: string) => (draft.value = value),
                            onSend: send,
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

export const Empty: Story = { args: { entries: [], draft: '' } }

export const Translated: Story = {
    args: {
        entries: [
            ...Array.from({ length: 12 }, (_, index): ChatHistoryEntry => ({
                id: `note-${index}`,
                channel: 'whisper',
                name: 'Мира',
                text: `Записка ${index + 1}. У ворот до заката будет тихо.`,
                at: index + 1,
            })),
            {
                id: 'translated',
                channel: 'whisper',
                name: 'Мира',
                language: 'en',
                text: 'Meet me at the north gate.',
                translation: { locale: 'ru', text: 'Встретимся у северных ворот.' },
                at: 13,
            },
        ],
        draft: '',
    },
}

export const Unavailable: Story = { args: { available: false } }
