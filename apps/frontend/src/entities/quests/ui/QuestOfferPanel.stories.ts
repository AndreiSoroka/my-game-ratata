import type { ItemId, QuestRewardMode } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    questDecisionArgs,
    questDecisionControls,
    type QuestDecisionStoryArgs,
    renderQuestDecisionStory,
} from './questDecisionStory'
import QuestOfferPanel from './QuestOfferPanel.vue'

interface StoryArgs extends QuestDecisionStoryArgs {
    requiredItems: Array<{ itemId: ItemId; quantity: number }>
    rewardGold: number
    rewardItems: Array<{ itemId: ItemId; quantity: number }>
    rewardFromCity: boolean
    rewardMode: QuestRewardMode
    status: 'none' | 'empty' | 'text' | 'occupied'
}

const meta = {
    title: 'Entities/quests/QuestOfferPanel',
    args: {
        ...questDecisionArgs('Предложение поручения', 'Взять', 'Отказаться'),
        requiredItems: [{ itemId: 'food', quantity: 3 }],
        rewardGold: 30,
        rewardItems: [],
        rewardFromCity: false,
        rewardMode: 'party_equal',
        status: 'none',
    },
    argTypes: {
        ...questDecisionControls,
        requiredItems: { control: 'object' },
        rewardGold: { control: { type: 'number', min: 0, step: 1 } },
        rewardItems: { control: 'object' },
        rewardFromCity: { control: 'boolean' },
        rewardMode: {
            control: {
                type: 'inline-radio',
                labels: { party_equal: 'Поровну отряду', submitter: 'Сдающему' },
            },
            options: ['party_equal', 'submitter'],
        },
        status: {
            name: 'Слот статуса',
            control: {
                type: 'select',
                labels: {
                    none: 'Без слота',
                    empty: 'Пустой div с фоном',
                    text: 'Текст',
                    occupied: 'Активный договор',
                },
            },
            options: ['none', 'empty', 'text', 'occupied'],
        },
    },
    render: (args) => renderQuestDecisionStory(QuestOfferPanel, args, 'offer'),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Occupied: Story = { args: { confirmDisabled: true, status: 'occupied' } }
