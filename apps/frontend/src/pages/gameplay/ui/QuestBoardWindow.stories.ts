import type { QuestBoardSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import QuestBoardWindow from './QuestBoardWindow.vue'

const board: QuestBoardSnapshot = {
    objectId: 'quest-board',
    entries: [
        {
            id: 'bell',
            revision: 1,
            source: 'guild',
            title: 'Колокол на границе',
            description: 'Помогите восстановить сторожевой колокол.',
            objectiveLabels: ['Принести три сердца слизи.'],
            rewardGold: 15,
            status: 'available',
        },
        {
            id: 'road',
            revision: 2,
            source: 'worker',
            title: 'Очистить лесную дорогу',
            description: 'Лесоруб ждёт возвращения к работе.',
            rewardGold: 6,
            status: 'ready',
        },
    ],
}
type Args = { board: QuestBoardSnapshot }
const meta = {
    title: 'Pages/gameplay/QuestBoardWindow',
    parameters: { backgrounds: { disable: false } },
    args: { board },
    render: (args) => renderVueStory(QuestBoardWindow, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Empty: Story = { args: { board: { ...board, entries: [] } } }
