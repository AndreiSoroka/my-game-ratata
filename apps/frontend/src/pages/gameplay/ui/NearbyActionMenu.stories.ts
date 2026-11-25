import type { HeroClass } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { heroClassTheme } from '@/entities/character-window'
import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'
import { provideDarkPanelTheme } from '@/shared/ui/theme'

import NearbyActionMenu from './NearbyActionMenu.vue'

type StoryArgs = InstanceType<typeof NearbyActionMenu>['$props'] & {
    content: StorySlot
    heroClass?: HeroClass
}
const meta = {
    title: 'Pages/gameplay/NearbyActionMenu',
    args: {
        open: true,
        contextLabel: 'Савва',
        targetKey: 'character:merchant',
        actions: [
            { id: 'speak', label: 'Поговорить' },
            { id: 'trade', label: 'Обмен недоступен', disabled: true },
        ],
        content: 'none',
    },
    argTypes: {
        open: { control: 'boolean' },
        contextLabel: { control: 'text' },
        targetKey: { control: 'text' },
        actions: { control: 'object' },
        neighbors: { control: 'object' },
        content: storySlotControl('Содержимое'),
        heroClass: { control: 'select', options: ['vanguard', 'ranger', 'arcanist', 'cleric'] },
    },
    render: ({ content, heroClass, ...props }) =>
        renderVueStory(
            {
                setup() {
                    provideDarkPanelTheme(heroClassTheme(heroClass))
                    return () =>
                        h(NearbyActionMenu, props, {
                            default: storySlot(content, 'Действия рядом', () =>
                                h(UiButton, { size: 'compact', disabled: true }, () => 'Сведения')
                            ),
                        })
                },
            },
            {}
        ),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}

export const Scholar: StoryObj<StoryArgs> = {
    args: {
        heroClass: 'arcanist',
        contextLabel: 'Учёный Арен',
        targetKey: 'character:scholar',
        actions: [
            { id: 'learn', label: 'Изучить огненную стрелу' },
            { id: 'whisper', label: 'Шёпот: Учёный Арен' },
            { id: 'follow', label: 'Следовать за Учёный Арен' },
            { id: 'enemy', label: 'Объявить врагом', danger: true },
        ],
    },
}
