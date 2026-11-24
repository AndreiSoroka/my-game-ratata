import type { WorkshopSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import type { WorkshopOrderAction } from '../model/workshopOrderAction'
import WorkshopOrders from './WorkshopOrders.vue'

interface StoryArgs {
    workshop: WorkshopSnapshot
    gold: number
    blocked: boolean
    onAction: (action: WorkshopOrderAction) => void
}

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

const meta = {
    title: 'Entities/shops/WorkshopOrders',
    args: { workshop, gold: 30, blocked: false, onAction: fn() },
    argTypes: {
        workshop: { control: 'object' },
        gold: { control: { type: 'number', min: 0 } },
        blocked: { control: 'boolean' },
        onAction: { control: false },
    },
    render(args) {
        const host = renderVueStory(WorkshopOrders, { ...args })
        host.style.minHeight = '0'
        host.style.maxWidth = '680px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const WaitingMaterials: Story = {
    args: {
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
    },
}
export const ReadyForCollection: Story = {
    args: {
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
    },
}
