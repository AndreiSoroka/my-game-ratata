import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import type { PatronStatusEntry } from '../model/patronStatus'
import FaithStatusList from './FaithStatusList.vue'

type StoryArgs = { patrons: readonly PatronStatusEntry[] }

const meta = {
    title: 'Entities/Player effects/FaithStatusList',
    parameters: { backgrounds: { disable: false } },
    globals: { backgrounds: { value: 'parchment' } },
    argTypes: { patrons: { control: 'object' } },
    render(args) {
        const host = renderVueStory(FaithStatusList, args)
        host.style.maxWidth = '268px'
        return host
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
