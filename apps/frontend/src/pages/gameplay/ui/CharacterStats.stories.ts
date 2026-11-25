import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { developmentCharacterFixture } from '@/game/testing/developmentFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import CharacterStats from './CharacterStats.vue'

type Args = InstanceType<typeof CharacterStats>['$props']

const meta = {
    title: 'Pages/Gameplay/CharacterStats',
    args: { player: developmentCharacterFixture() },
    argTypes: { player: { control: 'object' } },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(CharacterStats, args),
}
export const Vanguard: Story = {
    ...Default,
    args: { player: developmentCharacterFixture('vanguard') },
}
