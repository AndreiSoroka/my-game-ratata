import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import { defaultRegionLore, type RegionLoreContent } from '../model/regionLore'
import RegionLore from './RegionLore.vue'

const meta = {
    title: 'Entities/region-lore/RegionLore',
    args: defaultRegionLore(),
    argTypes: {
        regionName: { control: 'text', name: 'Название региона' },
        locationCount: { control: { type: 'number', min: 0, step: 1 }, name: 'Число локаций' },
        headingFirstLine: { control: 'text', name: 'Первая строка заголовка' },
        headingSecondLine: { control: 'text', name: 'Вторая строка заголовка' },
        description: { control: 'text', name: 'Описание' },
        invitation: { control: 'text', name: 'Приглашение' },
    },
    render: (args) => renderVueStory(RegionLore, { ...args }, { background: '#121816' }),
} satisfies Meta<RegionLoreContent>

export default meta
type Story = StoryObj<RegionLoreContent>

export const Default: Story = {}

export const WithBackdrop: Story = {
    render: (args) =>
        renderVueStory(
            RegionLore,
            { ...args },
            {
                background:
                    "linear-gradient(90deg, #080e0dd9 0%, #080e0d55 55%, #080e0d99 100%), url('/game/assets/ash-border.png') center / cover",
            }
        ),
}
