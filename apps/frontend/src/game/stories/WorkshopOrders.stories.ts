import '../ui/adventurePanel.css'

import type { WorkshopSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import InventoryOverlay from '../ui/InventoryOverlay.vue'
import WorkshopOrders from '../ui/WorkshopOrders.vue'
import { renderVueStory } from './renderVueStory'
const meta = { title: 'Game/WorkshopOrders' } satisfies Meta
export default meta
type Story = StoryObj
const workshop: WorkshopSnapshot = {
    npcId: 'npc_smith_1',
    offers: [
        {
            itemId: 'axe',
            label: 'Топор',
            stock: 0,
            fullPrice: 25,
            deposit: 13,
            remaining: 12,
            canOrder: true,
        },
    ],
    orders: [],
}
export const EmptyStock: Story = {
    render: () => renderVueStory(WorkshopOrders, { workshop, gold: 30 }),
}
export const WaitingMaterials: Story = {
    render: () =>
        renderVueStory(WorkshopOrders, {
            workshop: {
                ...workshop,
                offers: workshop.offers.map((offer) => ({ ...offer, canOrder: false })),
                orders: [
                    {
                        id: 'one',
                        npcId: 'npc_smith_1',
                        itemId: 'axe',
                        label: 'Топор',
                        status: 'waiting_materials',
                        fullPrice: 25,
                        deposit: 13,
                        remaining: 12,
                        createdAt: 0,
                    },
                ],
            },
            gold: 17,
        }),
}
export const ReadyForCollection: Story = {
    render: () =>
        renderVueStory(WorkshopOrders, {
            workshop: {
                ...workshop,
                offers: [],
                orders: [
                    {
                        id: 'one',
                        npcId: 'npc_smith_1',
                        itemId: 'stone_axe',
                        label: 'Каменный топор',
                        status: 'ready',
                        fullPrice: 10,
                        deposit: 5,
                        remaining: 5,
                        createdAt: 0,
                    },
                ],
            },
            gold: 20,
        }),
}
export const InventoryCondition: Story = {
    render: () =>
        renderVueStory(InventoryOverlay, {
            character: characterFixture('self', {
                equipment: {
                    weapon: { itemId: 'simple_sword', instanceId: 'sword', durability: 97 },
                },
                inventory: [{ itemId: 'axe', instanceId: 'axe', durability: 0 }],
            }),
            chests: [],
            gold: 123,
        }),
}
