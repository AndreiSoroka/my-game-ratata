import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { DialogueChoice } from '../model/dialogue'
import DialoguePanel from './DialoguePanel.vue'
import DialogueTargetSwitcher from './DialogueTargetSwitcher.vue'

const empty = () => h('div')
const identityExamples = {
    none: undefined,
    empty,
    name: () => h('span', { style: { paddingInline: '4px' } }, 'Эхо · говорит'),
}
const navigationExamples = {
    none: undefined,
    empty,
    characters: () =>
        h(DialogueTargetSwitcher, {
            neighbors: {
                left: { key: 'character:npc', name: 'Марина' },
                right: { key: 'character:companion', name: 'Северин из речного дозора' },
            },
        }),
}
const bodyExamples = {
    none: undefined,
    empty,
    details: () => h('p', 'Ремонт снаряжения доступен у кузнеца.'),
}
const choices: readonly DialogueChoice[] = [
    { id: 'trade', label: 'Посмотреть товары' },
    { id: 'city_report', label: 'Что нужно городу? Спрос и запасы' },
    { id: 'leave', label: 'Закончить разговор' },
]

interface StoryArgs {
    title: string
    closeLabel: string
    heading?: string
    inlineText?: string
    hint?: string
    choices: readonly DialogueChoice[]
    identity: keyof typeof identityExamples
    navigation: keyof typeof navigationExamples
    default: keyof typeof bodyExamples
}

const close = fn().mockName('close')
const choose = fn().mockName('choose')
const meta = {
    title: 'Entities/dialogues/DialoguePanel',
    args: {
        title: 'Торговец Савва',
        closeLabel: 'Закончить разговор',
        hint: 'PageUp / PageDown — читать реплику · Tab — ответы',
        choices,
        identity: 'none',
        navigation: 'none',
        default: 'none',
    },
    argTypes: {
        title: { control: 'text' },
        closeLabel: { control: 'text' },
        heading: { control: 'text' },
        inlineText: { control: 'text' },
        hint: { control: 'text' },
        choices: { control: 'object' },
        identity: {
            name: 'Слот персонажа',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', name: 'Сведения' },
            },
            options: ['none', 'empty', 'name'],
        },
        navigation: {
            name: 'Слот соседей',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', characters: 'Стрелки с именами' },
            },
            options: ['none', 'empty', 'characters'],
        },
        default: {
            name: 'Слот содержимого',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', details: 'Текст' },
            },
            options: ['none', 'empty', 'details'],
        },
    },
    render({ identity, navigation, default: body, ...props }) {
        const host = renderVueStory(
            () =>
                h(
                    DialoguePanel,
                    { ...props, onChoose: choose, onClose: close },
                    {
                        identity: identityExamples[identity],
                        navigation: navigationExamples[navigation],
                        default: bodyExamples[body],
                    }
                ),
            {},
            { padding: '16px' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '612px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Sign: Story = {
    args: {
        title: 'Часовня памяти',
        closeLabel: 'Закрыть табличку',
        inlineText: 'Выбор покровителя.\nЗа советом обратитесь к сестре Вере.',
        hint: '',
        choices: [{ id: 'leave', label: 'Закрыть' }],
    },
}

export const LongChoices: Story = {
    args: {
        choices: [
            ...choices.slice(0, -1),
            { id: 'order', label: 'Сделать заказ' },
            { id: 'repair', label: 'Починить снаряжение' },
            { id: 'guild', label: 'Что нового в городской гильдии?' },
            { id: 'market', label: 'Когда откроется рынок?' },
            { id: 'schedule', label: 'В какое время приходят караваны?' },
            { id: 'stock', label: 'Что заканчивается в городской лавке?' },
            { id: 'routes', label: 'Какая дорога ведёт к мельнице?' },
            { id: 'travel', label: 'Расскажи про дальние земли' },
            { id: 'rumors', label: 'Расскажи про городские слухи' },
            { id: 'chapel', label: 'Как добраться до часовни?' },
            ...choices.slice(-1),
        ],
    },
}

export const WithNeighbors: Story = { args: { navigation: 'characters' } }
