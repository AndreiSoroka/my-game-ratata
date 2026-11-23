import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { FantasyBorder } from '@/shared/ui/external'

import { type CharacterTab, characterTabs } from '../model/characterTab'
import CharacterWindowView from './CharacterWindowView.vue'

interface StoryArgs {
    nickname: string
    tab: CharacterTab
    frame: 'empty' | 'border'
    close: 'empty' | 'button'
    tabButton: 'empty' | 'button'
    content: 'empty' | 'text'
    footer: 'empty' | 'text'
    onClose: () => void
}

const labels = Object.fromEntries(characterTabs.map(({ id, label }) => [id, label]))

const meta = {
    title: 'Entities/character-window/CharacterWindowView',
    args: {
        nickname: 'Андрей Сорока',
        tab: 'stats',
        frame: 'empty',
        close: 'button',
        tabButton: 'button',
        content: 'text',
        footer: 'text',
        onClose: fn().mockName('close'),
    },
    argTypes: {
        nickname: { control: 'text' },
        tab: { control: { type: 'select', labels }, options: characterTabs.map(({ id }) => id) },
        frame: {
            control: { type: 'select', labels: { empty: 'Пустой div', border: 'Рамка' } },
            options: ['empty', 'border'],
        },
        close: {
            control: { type: 'select', labels: { empty: 'Пустой div', button: 'Кнопка' } },
            options: ['empty', 'button'],
        },
        tabButton: {
            control: { type: 'select', labels: { empty: 'Пустой div', button: 'Кнопка' } },
            options: ['empty', 'button'],
        },
        content: {
            control: { type: 'select', labels: { empty: 'Пустой div', text: 'Текст вкладки' } },
            options: ['empty', 'text'],
        },
        footer: {
            control: { type: 'select', labels: { empty: 'Пустой div', text: 'Подсказка' } },
            options: ['empty', 'text'],
        },
        onClose: { control: false },
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {
    render(args) {
        const slots = {
            frame: () => [
                args.frame === 'empty'
                    ? h('div')
                    : h(FantasyBorder, {
                          border: 'border-017',
                          color: 'var(--ui-dark-panel-border)',
                          style: { position: 'absolute', inset: 0, pointerEvents: 'none' },
                          'aria-hidden': 'true',
                      }),
            ],
            ...(args.close === 'empty' && { close: () => [h('div')] }),
            ...(args.tabButton === 'empty' && { tab: () => [h('div')] }),
            default: ({ tab }) => [
                args.content === 'empty' ? h('div') : h('p', `Раздел «${labels[tab]}»`),
            ],
            footer: () => [
                args.footer === 'empty' ? h('div') : h('span', 'Стрелки — выбрать вкладку'),
            ],
        } satisfies InstanceType<typeof CharacterWindowView>['$slots']
        const host = renderVueStory(
            {
                render: () =>
                    h(
                        CharacterWindowView,
                        { nickname: args.nickname, tab: args.tab, onClose: args.onClose },
                        slots
                    ),
            },
            { padding: '0' }
        )
        host.style.minHeight = '100dvh'
        return host
    },
}
