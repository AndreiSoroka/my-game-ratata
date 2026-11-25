import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { adventureFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import CharacterCrafting from './CharacterCrafting.vue'

type Args = InstanceType<typeof CharacterCrafting>['$props']
const base = adventureFixture()
const adventure: Args['adventure'] = {
    ...base,
    materials: { ...base.materials, fiber: 3 },
    recipes: [
        { id: 'bake_bread', itemId: 'food', label: 'Испечь хлеб', cost: { grain: 3 } },
        { id: 'boots', itemId: 'boots', label: 'Сплести сапоги', cost: { fiber: 3 } },
    ],
}
const meta = {
    title: 'Pages/Gameplay/CharacterCrafting',
    args: { adventure, alive: true },
    argTypes: { adventure: { control: 'object' }, alive: { control: 'boolean' } },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(CharacterCrafting, args),
}
export const Unavailable: Story = { ...Default, args: { alive: false } }
