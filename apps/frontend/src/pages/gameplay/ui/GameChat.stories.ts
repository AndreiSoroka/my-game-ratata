import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { ChatHistoryEntry } from '@/entities/chats'
import type { ChatInputState } from '@/game/runtime/chatInput'
import { renderVueStory } from '@/shared/lib/storybook'

import GameChat from './GameChat.vue'

const entries: ChatHistoryEntry[] = [
    { id: 'speech-mira', channel: 'say', name: 'Мира', text: 'Слышите звон колокола?', at: 100 },
    {
        id: 'speech-sava',
        channel: 'say',
        name: 'Савва',
        text: 'Слышу. Значит, пора в путь.',
        at: 200,
    },
]
type Args = { state: ChatInputState; entries: ChatHistoryEntry[] }
const meta = {
    title: 'Pages/gameplay/GameChat',
    parameters: { backgrounds: { disable: false } },
    args: { state: { active: false, draft: '', maxLength: 400 }, entries },
    render: (args) => renderVueStory(GameChat, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Composing: Story = {
    args: { state: { active: true, draft: 'Мы готовы.', maxLength: 400 } },
}
