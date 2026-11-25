import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { adventureFixture, characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import CharacterQuests from './CharacterQuests.vue'

type Args = InstanceType<typeof CharacterQuests>['$props']
const player = characterFixture('hero')
const adventure = adventureFixture()
const snapshot: Args['snapshot'] = {
    ...worldFixture([player]),
    adventure: {
        ...adventure,
        quest: { ...adventure.quest, status: 'active' },
    },
}
const meta = {
    title: 'Pages/Gameplay/CharacterQuests',
    args: { player, characters: [], snapshot },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        snapshot: { control: 'object' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(CharacterQuests, args),
}
export const Empty: Story = { ...Default, args: { snapshot: worldFixture([player]) } }
