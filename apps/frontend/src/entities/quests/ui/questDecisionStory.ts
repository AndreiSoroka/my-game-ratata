import type { QuestRewardMode } from '@my-game-ratata/contracts'
import type { Meta } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { type Component, h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { QuestDecisionProps } from './questDecisionProps'
import QuestItemList from './QuestItemList.vue'

type QuestStage = 'offer' | 'turnIn'

export interface QuestDecisionStoryArgs extends Required<QuestDecisionProps> {
    default: 'details' | 'long' | 'empty' | 'text' | 'delivery'
    status?: 'none' | 'empty' | 'text' | 'occupied'
    chooseRewardMode?: boolean
    rewardMode?: QuestRewardMode
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
                empty: 'Пустой div с фоном',
                text: 'Текст',
                delivery: 'Готовая доставка',
            },
        },
        options: ['details', 'long', 'empty', 'text', 'delivery'],
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
    offer: 'Весна просит принести свежие яблоки для гостей трактира.',
    turnIn: 'Трофей готов к передаче. Заказчик проверит, что работник смог вернуться к своему участку.',
}

const turnInObjectives = [
    'Участок находится в Северном предместье, рядом с оградой хозяйства.',
    'Работник заметил скелетов и остаётся в городе, пока дорога до фермы небезопасна.',
    'Для доклада нужна одна кость. Подойдёт трофей, найденный раньше.',
    'После доклада работник отправится на участок и выполнит один пробный этап работы.',
    'Дождитесь возвращения работника к распорядителю и сдайте поручение.',
    'Распорядитель проверит результат и выплатит награду из городского фонда.',
]
const offerObjectives = [
    'Свежие яблоки можно купить у торговца на площади.',
    'Когда соберёте нужное количество, отнесите яблоки Весне в трактир.',
]

function questDetails(stage: QuestStage, content: QuestDecisionStoryArgs['default']) {
    if (content === 'empty')
        return h('div', { style: { minHeight: '26px', background: '#8b4865' } })
    if (content === 'text') return descriptions[stage]
    if (content === 'delivery')
        return h('div', [
            h('h3', 'Сердца для колокола памяти'),
            h('p', 'Мира примет три слизневых сердца из рюкзака.'),
            h('p', ['Заказчик: ', h('strong', 'Мира')]),
            h(QuestItemList, { items: [{ itemId: 'slime_heart', quantity: 3 }] }),
            h('p', [h('strong', 'Общая награда: 40 золотых')]),
        ])
    const issuer =
        content === 'long'
            ? 'РаспорядительСеверныхОкрестностейИзДальнегоПоселения'
            : stage === 'offer'
              ? 'Весна'
              : 'Городской распорядитель'
    const objectives = stage === 'offer' ? offerObjectives : turnInObjectives
    return h('div', [
        h('h3', stage === 'offer' ? 'Яблоки для трактира' : 'Помочь фермеру вернуться к работе'),
        h('p', descriptions[stage]),
        h('p', ['Заказчик: ', h('strong', issuer)]),
        content === 'long'
            ? h(
                  'ol',
                  objectives.map((objective) => h('li', objective))
              )
            : null,
        stage === 'turnIn' && h(QuestItemList, { items: [{ itemId: 'bone', quantity: 1 }] }),
        stage === 'turnIn' && h('p', [h('strong', 'Общая награда: 30 золотых')]),
    ])
}

export function renderQuestDecisionStory(
    component: Component,
    { default: content, status, ...props }: QuestDecisionStoryArgs,
    stage: QuestStage
): HTMLElement {
    const slots = {
        default: () => questDetails(stage, content),
        status: () =>
            status === 'occupied'
                ? h('p', { role: 'status' }, 'Сначала завершите или отмените текущий договор.')
                : status === 'text'
                  ? 'Поручение ещё доступно.'
                  : h('div', { style: { minHeight: '20px', background: '#374c82' } }),
    }
    const host = renderVueStory(
        () => h(component, props, status && status !== 'none' ? slots : { default: slots.default }),
        {}
    )
    host.style.maxWidth = '592px'
    host.style.padding = '16px'
    return host
}
