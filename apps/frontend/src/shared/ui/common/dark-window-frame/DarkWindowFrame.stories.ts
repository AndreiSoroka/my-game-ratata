import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { darkPanelButtonColors, UiButton } from '../button'
import DarkWindowFrame from './DarkWindowFrame.vue'

const close = fn().mockName('close')
const empty = () => h('div')
const summaries = {
    none: undefined,
    empty,
    usedSlots: () => 'Занято 2 из 10 слотов',
}
const bodies = {
    empty,
    items: () => h('ul', [h('li', 'Фляга × 1'), h('li', 'Походный плащ × 1')]),
}
const actions = {
    none: undefined,
    empty,
    button: () =>
        h(
            UiButton,
            { appearance: 'panel', colors: darkPanelButtonColors, onClick: close },
            () => 'Закрыть'
        ),
}

interface StoryArgs {
    title: string
    summary: keyof typeof summaries
    default: keyof typeof bodies
    actions: keyof typeof actions
}

const meta = {
    title: 'Shared/Common/DarkWindowFrame',
    args: { title: 'Рюкзак', summary: 'usedSlots', default: 'items', actions: 'button' },
    argTypes: {
        title: { control: 'text' },
        summary: {
            name: 'Слот сводки',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', usedSlots: 'Занятые слоты' },
            },
            options: ['none', 'empty', 'usedSlots'],
        },
        default: {
            name: 'Слот содержимого',
            control: { type: 'select', labels: { empty: 'Пустой div', items: 'Предметы' } },
            options: ['empty', 'items'],
        },
        actions: {
            name: 'Слот действий',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', button: 'Кнопка закрытия' },
            },
            options: ['none', 'empty', 'button'],
        },
    },
    render({ title, summary, default: body, actions: footer }) {
        const host = renderVueStory(
            () =>
                h(
                    DarkWindowFrame,
                    { title, onClose: close },
                    { summary: summaries[summary], default: bodies[body], actions: actions[footer] }
                ),
            {},
            { padding: '16px' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '544px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta

export const Default: StoryObj<StoryArgs> = {}
