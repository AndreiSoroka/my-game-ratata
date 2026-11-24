import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { darkPanelButtonColors, UiButton } from '@/shared/ui/common'

import ExchangeWindowFrame from './ExchangeWindowFrame.vue'

const close = fn()
const empty = () => h('div')
const summary = {
    text: () => h('div', 'Вы подтвердили условия. Мира ещё не подтвердила.'),
    empty,
}
const content = {
    text: () => h('div', 'Вы предлагаете 3 яблока. Мира предлагает 7 золотых.'),
    empty,
}
const actions = {
    button: () =>
        h(
            UiButton,
            { appearance: 'panel', colors: darkPanelButtonColors, onClick: close },
            () => 'Закрыть'
        ),
    empty,
}

interface StoryArgs {
    title: string
    summary: keyof typeof summary
    default: keyof typeof content
    actions: keyof typeof actions
}

const meta = {
    title: 'Entities/exchanges/ExchangeWindowFrame',
    args: { title: 'Обмен · Мира', summary: 'text', default: 'text', actions: 'button' },
    argTypes: {
        title: { control: 'text' },
        summary: { control: 'select', options: ['text', 'empty'] },
        default: { control: 'select', options: ['text', 'empty'] },
        actions: { control: 'select', options: ['button', 'empty'] },
    },
    render({ title, summary: summaryKey, default: contentKey, actions: actionsKey }) {
        const host = renderVueStory(
            () =>
                h(
                    ExchangeWindowFrame,
                    { title, onClose: close },
                    {
                        summary: summary[summaryKey],
                        default: content[contentKey],
                        actions: actions[actionsKey],
                    }
                ),
            {},
            { padding: '16px' }
        )
        host.style.display = 'flex'
        host.style.flexDirection = 'column'
        host.style.height = 'min(360px, 100dvh)'
        host.style.minHeight = '0'
        host.style.maxWidth = '640px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta

export const Default: StoryObj<StoryArgs> = {}
