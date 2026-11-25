import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import InventoryOverlay from './InventoryOverlay.vue'

type Args = InstanceType<typeof InventoryOverlay>['$props']
function character(equipped = false) {
    return characterFixture('self', {
        inventory: [
            { instanceId: 'apple', itemId: 'food', quantity: 5 },
            { instanceId: 'grain', itemId: 'grain', quantity: 3 },
            { instanceId: 'herbs', itemId: 'herbs', quantity: 9 },
            { instanceId: 'sword', itemId: 'simple_sword', durability: 160 },
            { instanceId: 'torch', itemId: 'torch' },
        ],
        equipment: equipped
            ? {
                  weapon: { instanceId: 'axe', itemId: 'axe', durability: 700 },
                  light: { instanceId: 'lantern', itemId: 'lantern' },
              }
            : {},
    })
}
const meta = {
    title: 'Pages/Gameplay/InventoryOverlay',
    args: { character: character(), chests: [], gold: 12 },
    argTypes: {
        character: { control: 'object' },
        chests: { control: 'object' },
        gold: { control: 'number' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render(args) {
        const host = renderVueStory(InventoryOverlay, args, { padding: '0', background: '#354137' })
        host.style.minHeight = '100dvh'
        return host
    },
}
export const UserInventory: Story = { ...Default }
export const Equipment: Story = { ...Default, args: { character: character(true) } }
