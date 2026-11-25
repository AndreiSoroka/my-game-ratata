import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'

import { type CharacterTab, characterTabs } from '../model/characterTab'
import CharacterWindowView from './CharacterWindowView.vue'

interface StoryArgs {
    nickname: string
    tab: CharacterTab
    frame: StorySlot
    close: StorySlot
    tabButton: StorySlot
    content: StorySlot
    footer: StorySlot
    onClose: () => void
}

const labels = Object.fromEntries(characterTabs.map(({ id, label }) => [id, label]))

const meta = {
    title: 'Entities/character-window/CharacterWindowView',
    args: {
        nickname: 'Андрей Сорока',
        tab: 'stats',
        frame: 'none',
        close: 'none',
        tabButton: 'none',
        content: 'text',
        footer: 'text',
        onClose: fn().mockName('close'),
    },
    argTypes: {
        nickname: { control: 'text' },
        tab: { control: { type: 'select', labels }, options: characterTabs.map(({ id }) => id) },
        frame: storySlotControl('frame'),
        close: storySlotControl('close'),
        tabButton: storySlotControl('tabButton'),
        content: storySlotControl('content'),
        footer: storySlotControl('footer'),
        onClose: { control: false },
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>
type Slots = InstanceType<typeof CharacterWindowView>['$slots']
type SlotProps<Key extends 'close' | 'tab'> = Parameters<NonNullable<Slots[Key]>>[0]

export const Default: Story = {
    render(args) {
        const slots = {
            frame: storySlot(args.frame, 'Рамка персонажа', () =>
                h(FantasyBorder, {
                    border: 'border-017',
                    color: 'var(--ui-dark-panel-border)',
                    style: { position: 'absolute', inset: 0, pointerEvents: 'none' },
                    'aria-hidden': 'true',
                })
            ),
            close: storySlot<SlotProps<'close'>>(
                args.close,
                'Закрыть',
                ({ buttonAttrs }) =>
                    h(
                        UiButton,
                        { ...buttonAttrs, size: 'small', icon: true },
                        { default: () => '×' }
                    ),
                { inline: true, color: '#9d604d' }
            ),
            tab: storySlot<SlotProps<'tab'>>(
                args.tabButton,
                'Вкладка',
                ({ label, buttonAttrs }) =>
                    h(
                        UiButton,
                        { ...buttonAttrs, highlighted: buttonAttrs['aria-selected'] },
                        {
                            default: () => label,
                        }
                    ),
                { inline: true, color: '#486c94' }
            ),
            default: storySlot(
                args.content,
                `Раздел «${labels[args.tab]}»`,
                () => h('dl', [h('dt', 'Здоровье'), h('dd', '68 / 100')]),
                { color: '#5e7d66' }
            ),
            footer: storySlot(args.footer, 'Стрелки — выбрать вкладку', () =>
                h('span', [h('kbd', 'Esc'), ' — закрыть'])
            ),
        }
        const host = renderVueStory(
            {
                render: () =>
                    h(
                        CharacterWindowView,
                        { nickname: args.nickname, tab: args.tab, onClose: args.onClose },
                        slots
                    ),
            },
            {},
            { padding: '0' }
        )
        host.style.minHeight = '100dvh'
        return host
    },
}
