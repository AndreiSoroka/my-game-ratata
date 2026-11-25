import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { developmentCharacterFixture } from '@/game/testing/developmentFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import CharacterDevelopment from './CharacterDevelopment.vue'

type Args = InstanceType<typeof CharacterDevelopment>['$props']

const meta = {
    title: 'Pages/Gameplay/CharacterDevelopment',
    args: { player: developmentCharacterFixture(), characters: [] },
    argTypes: { player: { control: 'object' }, characters: { control: 'object' } },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(CharacterDevelopment, args),
}
export const WithoutSky: Story = {
    ...Default,
    args: { player: { ...developmentCharacterFixture(), progression: undefined } },
}
