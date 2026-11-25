import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'

import InventoryHud from './InventoryHud.vue'

type Args = InstanceType<typeof InventoryHud>['$props'] & { surface: StorySlot }
const player = characterFixture('mira', {
    nickname: 'Мира',
    inventory: [{ instanceId: 'apple', itemId: 'food', quantity: 3 }],
})
const meta = {
    title: 'Pages/Gameplay/InventoryHud',
    args: { player, snapshot: worldFixture([player]), inventoryOpen: true, surface: 'none' },
    argTypes: {
        player: { control: 'object' },
        snapshot: { control: 'object' },
        inventoryOpen: { control: 'boolean' },
        surface: storySlotControl('Игровая область'),
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render({ surface, ...props }) {
        const slot = storySlot(surface, 'Область игрового мира', () =>
            h('canvas', {
                'aria-label': 'Игровая область',
                style: {
                    background: '#354137',
                    display: 'block',
                    minBlockSize: '70vh',
                    inlineSize: '100%',
                },
            })
        )
        const host = renderVueStory(
            { render: () => h(InventoryHud, { ...props }, slot ? { surface: slot } : {}) },
            {},
            { padding: '0' }
        )
        host.style.minHeight = '100dvh'
        return host
    },
}
export const Closed: Story = { ...Default, args: { inventoryOpen: false } }
