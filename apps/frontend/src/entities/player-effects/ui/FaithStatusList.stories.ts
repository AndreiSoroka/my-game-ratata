import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { HudFrame } from '@/shared/ui/common/hud-frame'

import type { PatronStatusEntry } from '../model/patronStatus'
import FaithStatusList from './FaithStatusList.vue'

type StoryArgs = { patrons: readonly PatronStatusEntry[] }

const meta = {
    title: 'Entities/Player effects/FaithStatusList',
    argTypes: { patrons: { control: 'object' } },
    render(args) {
        return renderVueStory(
            {
                render: () =>
                    h(HudFrame, { style: { width: 'min(220px, 100%)' } }, () =>
                        h(FaithStatusList, { ...args })
                    ),
            },
            {}
        )
    },
} satisfies Meta<StoryArgs>

export default meta

export const MultiplePatrons: StoryObj<StoryArgs> = {
    args: {
        patrons: [
            { id: 'road', name: 'Безымянный Путник', level: 2 },
            { id: 'hearth', name: 'Угольная Мать', level: 6, mood: 'benevolent' },
            { id: 'grave', name: 'Хранитель Праха', level: 3, mood: 'wrathful' },
            { id: 'lantern', name: 'Слепой Архивариус', mood: 'neutral' },
        ],
    },
}
