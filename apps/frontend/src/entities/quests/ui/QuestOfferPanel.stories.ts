import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    questDecisionArgs,
    questDecisionControls,
    type QuestDecisionStoryArgs,
    renderQuestDecisionStory,
} from './questDecisionStory'
import QuestOfferPanel from './QuestOfferPanel.vue'

const meta = {
    title: 'Entities/quests/QuestOfferPanel',
    args: questDecisionArgs('Предложение поручения', 'Взять', 'Отказаться'),
    argTypes: questDecisionControls,
    render: (args) => renderQuestDecisionStory(QuestOfferPanel, args, 'offer'),
} satisfies Meta<QuestDecisionStoryArgs>

export default meta
type Story = StoryObj<QuestDecisionStoryArgs>

export const Default: Story = {}

export const Occupied: Story = { args: { confirmDisabled: true } }
