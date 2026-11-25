import { heroClasses } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import HeroBackgroundSummary from './HeroBackgroundSummary.vue'

type Args = InstanceType<typeof HeroBackgroundSummary>['$props']

const meta = {
    title: 'Entities/character-window/HeroBackgroundSummary',
    args: { heroClass: 'cleric', showTitle: true },
    argTypes: {
        heroClass: { control: 'select', options: [null, ...heroClasses] },
        showTitle: { control: 'boolean' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(HeroBackgroundSummary, args, { padding: '16px' }),
}
export const WithoutTitle: Story = { ...Default, args: { showTitle: false } }
