import '../ui/rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import ChestContainer from '../ui/ChestContainer.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/Containers' } satisfies Meta
export default meta
type Story = StoryObj
const player = characterFixture('owner', {
    inventory: [{ instanceId: 'axe', itemId: 'axe', durability: 700 }],
})
const chest = {
    kind: 'barrel',
    chestId: 'supplies',
    title: 'Бочка общих припасов',
    items: [
        { instanceId: 'wood', itemId: 'wood' },
        { instanceId: 'fiber', itemId: 'fiber' },
    ],
}
export const Barrel: Story = { render: () => renderVueStory(ChestContainer, { player, chest }) }
export const EmptyBarrel: Story = {
    render: () => renderVueStory(ChestContainer, { player, chest: { ...chest, items: [] } }),
}
