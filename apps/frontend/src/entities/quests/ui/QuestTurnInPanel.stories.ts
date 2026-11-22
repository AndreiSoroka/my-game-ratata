import type { Meta, StoryObj } from '@storybook/web-components-vite'

import {
    questDecisionArgs,
    questDecisionControls,
    type QuestDecisionStoryArgs,
    renderQuestDecisionStory,
} from './questDecisionStory'
import QuestTurnInPanel from './QuestTurnInPanel.vue'

const meta = {
    title: 'Entities/quests/QuestTurnInPanel',
    args: questDecisionArgs('Сдать поручение', 'Сдать', 'Вернуться к разговору'),
    argTypes: questDecisionControls,
    render: (args) => renderQuestDecisionStory(QuestTurnInPanel, args, 'turnIn'),
} satisfies Meta<QuestDecisionStoryArgs>

export default meta
type Story = StoryObj<QuestDecisionStoryArgs>

export const Default: Story = {}

export const Pending: Story = {
    args: { confirmLabel: 'Проверяем…', confirmDisabled: true, cancelDisabled: true },
}

export const LongDetails: Story = {
    args: { default: 'long', confirmLabel: 'Передать трофей и доложить' },
}
