import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import QuestItemList from './QuestItemList.vue'
import type { QuestItemListProps } from './questItemListProps'

const meta = {
    title: 'Entities/quests/QuestItemList',
    args: {
        items: [{ itemId: 'food', quantity: 3 }],
        kind: 'required',
        showHeading: true,
    },
    argTypes: {
        items: { control: 'object' },
        kind: { control: 'radio', options: ['required', 'reward'] },
        showHeading: { control: 'boolean' },
    },
    render: (args) => renderVueStory(QuestItemList, { ...args }),
} satisfies Meta<QuestItemListProps>

export default meta
type Story = StoryObj<QuestItemListProps>

export const Default: Story = {}

export const MissingItems: Story = {
    args: {
        items: [
            { itemId: 'slime_heart', quantity: 3, available: 1 },
            { itemId: 'bone', quantity: 1 },
        ],
    },
}

export const Reward: Story = { args: { kind: 'reward' } }
