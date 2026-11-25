import { heroClasses } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import HeroClassIcon from './HeroClassIcon.vue'

type Args = InstanceType<typeof HeroClassIcon>['$props']

const meta = {
    title: 'Entities/character-window/HeroClassIcon',
    args: { heroClass: 'vanguard' },
    argTypes: {
        heroClass: { control: 'select', options: heroClasses },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(HeroClassIcon, args),
}
export const Ranger: Story = { ...Default, args: { heroClass: 'ranger' } }
