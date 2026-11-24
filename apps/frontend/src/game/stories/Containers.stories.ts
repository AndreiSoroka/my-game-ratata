import '../ui/rpgControls.css'

import { CHEST_CAPACITY, type ChestContainerSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import ChestContainer from '../ui/ChestContainer.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/ChestContainer' } satisfies Meta
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

const fullChest: ChestContainerSnapshot = {
    kind: 'chest',
    chestId: 'full-chest',
    capacity: CHEST_CAPACITY,
    items: [
        { instanceId: 'chest-herbs', itemId: 'herbs', quantity: 6 },
        { instanceId: 'boots', itemId: 'boots' },
        { instanceId: 'grain', itemId: 'grain', quantity: 9 },
        { instanceId: 'food', itemId: 'food' },
        { instanceId: 'seeds', itemId: 'wheat_seed', quantity: 9 },
        ...Array.from({ length: CHEST_CAPACITY - 5 }, (_, index) => ({
            instanceId: `wood-${index}`,
            itemId: 'wood' as const,
        })),
    ],
}
export const FullChest: Story = {
    render: () => {
        const host = renderVueStory(ChestContainer, {
            chest: fullChest,
            player: characterFixture('owner', {
                inventory: [
                    ...player.inventory,
                    { instanceId: 'bag-herbs', itemId: 'herbs', quantity: 2 },
                ],
            }),
        })
        host.style.minHeight = '100dvh'
        return host
    },
}
