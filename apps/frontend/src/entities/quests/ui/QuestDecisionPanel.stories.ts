import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import QuestDecisionPanel from './QuestDecisionPanel.vue'
import {
    questDecisionArgs,
    questDecisionControls,
    type QuestDecisionStoryArgs,
} from './questDecisionStory'
import QuestItemList from './QuestItemList.vue'

const contentExamples = {
    empty: () => h('div', { style: { minHeight: '22px', background: '#8b4865' } }),
    details: () => [
        h('h3', 'Проверить дорогу'),
        h('p', 'Осмотрите тропу до поселения.'),
        h(QuestItemList, { items: [{ itemId: 'wood', quantity: 2 }] }),
    ],
    text: () => 'Вернитесь к заказчику до заката.',
}

type StoryArgs = Omit<QuestDecisionStoryArgs, 'default' | 'status'> & {
    default: keyof typeof contentExamples
}

const meta = {
    title: 'Entities/quests/QuestDecisionPanel',
    args: { ...questDecisionArgs('Панель', 'Подтвердить', 'Отмена'), default: 'empty' },
    argTypes: {
        ...questDecisionControls,
        default: {
            name: 'Содержимое слота',
            control: {
                type: 'select',
                labels: { empty: 'Пустой div', details: 'Наполнение', text: 'Текст' },
            },
            options: ['empty', 'details', 'text'],
        },
    },
    render({ default: content, ...props }) {
        const host = renderVueStory(
            () => h(QuestDecisionPanel, props, { default: contentExamples[content] }),
            {},
            { padding: '16px' }
        )
        host.style.maxWidth = '592px'
        host.style.minHeight = '0'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
