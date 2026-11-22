import type { Meta, StoryObj } from '@storybook/web-components-vite'

import QuestDecisionPanel from './QuestDecisionPanel.vue'
import {
    questDecisionArgs,
    questDecisionControls,
    type QuestDecisionStoryArgs,
    renderQuestDecisionStory,
} from './questDecisionStory'

const meta = {
    title: 'Entities/quests/QuestDecisionPanel',
    args: questDecisionArgs('Поручение', 'Подтвердить', 'Отмена'),
    argTypes: questDecisionControls,
    render: (args) => renderQuestDecisionStory(QuestDecisionPanel, args, 'offer'),
} satisfies Meta<QuestDecisionStoryArgs>

export default meta
type Story = StoryObj<QuestDecisionStoryArgs>

export const Default: Story = {}
