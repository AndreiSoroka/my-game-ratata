import type { Meta } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { type Component, h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { QuestDecisionProps } from './questDecisionProps'

type QuestStage = 'offer' | 'turnIn'

export interface QuestDecisionStoryArgs extends Required<QuestDecisionProps> {
    default: 'details' | 'long' | 'empty'
    onConfirm: () => void
    onCancel: () => void
}

export const questDecisionControls: Meta<QuestDecisionStoryArgs>['argTypes'] = {
    heading: { control: 'text' },
    confirmLabel: { control: 'text' },
    cancelLabel: { control: 'text' },
    confirmDisabled: { control: 'boolean' },
    cancelDisabled: { control: 'boolean' },
    default: {
        name: 'Содержимое слота',
        control: {
            type: 'select',
            labels: {
                details: 'Условия поручения',
                long: 'Подробные условия',
                empty: 'Пустой div',
            },
        },
        options: ['details', 'long', 'empty'],
    },
    onConfirm: { control: false, table: { disable: true } },
    onCancel: { control: false, table: { disable: true } },
}

export function questDecisionArgs(
    heading: string,
    confirmLabel: string,
    cancelLabel: string
): QuestDecisionStoryArgs {
    return {
        heading,
        confirmLabel,
        cancelLabel,
        confirmDisabled: false,
        cancelDisabled: false,
        default: 'details',
        onConfirm: fn().mockName('confirm'),
        onCancel: fn().mockName('cancel'),
    }
}

const descriptions = {
    offer: 'На ферме появились скелеты. Агафья ждёт помощи у распорядителя.',
    turnIn: 'Трофей готов к передаче. Заказчик проверит, что работник смог вернуться к своему участку.',
}

const objectives = [
    'Участок находится в Северном предместье, рядом с оградой хозяйства.',
    'Работник заметил скелетов и остаётся в городе, пока дорога до фермы небезопасна.',
    'Для доклада нужна одна кость. Подойдёт трофей, найденный раньше.',
    'После доклада работник отправится на участок и выполнит один пробный этап работы.',
    'Дождитесь возвращения работника к распорядителю и сдайте поручение.',
    'Распорядитель проверит результат и выплатит награду из городского фонда.',
]

function questDetails(stage: QuestStage, content: QuestDecisionStoryArgs['default']) {
    if (content === 'empty') return h('div')
    const issuer =
        content === 'long'
            ? 'РаспорядительСеверныхОкрестностейИзДальнегоПоселения'
            : 'Городской распорядитель'
    return h('div', [
        h('h3', 'Помочь фермеру вернуться к работе'),
        h('p', descriptions[stage]),
        h('p', ['Заказчик: ', h('strong', issuer)]),
        content === 'long'
            ? h(
                  'ol',
                  objectives.map((objective) => h('li', objective))
              )
            : h('p', 'Для доклада нужна одна кость.'),
        h('p', [h('strong', 'Общая награда: 30 золотых')]),
    ])
}

export function renderQuestDecisionStory(
    component: Component,
    { default: content, ...props }: QuestDecisionStoryArgs,
    stage: QuestStage
): HTMLElement {
    const host = renderVueStory(() => h(component, props, () => questDetails(stage, content)), {})
    host.style.maxWidth = '592px'
    host.style.padding = '16px'
    return host
}
