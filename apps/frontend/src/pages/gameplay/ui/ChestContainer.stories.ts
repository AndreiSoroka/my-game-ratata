import { CHEST_CAPACITY, type ChestContainerSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import ChestContainer from './ChestContainer.vue'

type Args = InstanceType<typeof ChestContainer>['$props']
const player = characterFixture('owner', {
    inventory: [{ instanceId: 'axe', itemId: 'axe', durability: 700 }],
})
const chest: ChestContainerSnapshot = {
    kind: 'barrel',
    chestId: 'supplies',
    title: 'Бочка общих припасов',
    items: [
        { instanceId: 'wood', itemId: 'wood' },
        { instanceId: 'fiber', itemId: 'fiber' },
    ],
}
const meta = {
    title: 'Pages/Gameplay/ChestContainer',
    args: { player, chest },
    argTypes: { player: { control: 'object' }, chest: { control: 'object' } },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render(args) {
        const host = renderVueStory(ChestContainer, args, { padding: '0' })
        host.style.minHeight = '100dvh'
        return host
    },
}
export const Barrel: Story = { ...Default }
export const EmptyBarrel: Story = { ...Default, args: { chest: { ...chest, items: [] } } }

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
    ...Default,
    args: {
        chest: fullChest,
        player: characterFixture('owner', {
            inventory: [
                ...player.inventory,
                { instanceId: 'bag-herbs', itemId: 'herbs', quantity: 2 },
            ],
        }),
    },
}
