import type { RepairSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import RepairWorkshop from './RepairWorkshop.vue'

interface StoryArgs {
    repairs: RepairSnapshot
    gold: number
    blocked: boolean
    onRepair: (instanceIds: string[], expectedTotal: number) => void
}

const meta = {
    title: 'Entities/shops/RepairWorkshop',
    args: {
        repairs: {
            npcId: 'npc_smith_1',
            total: 12,
            items: [
                {
                    instanceId: 'sword',
                    itemId: 'simple_sword',
                    label: 'Простой меч',
                    durability: 0,
                    maxDurability: 200,
                    price: 10,
                    equipped: true,
                },
                {
                    instanceId: 'axe',
                    itemId: 'axe',
                    label: 'Топор',
                    durability: 850,
                    maxDurability: 1000,
                    price: 2,
                    equipped: false,
                },
            ],
        },
        gold: 20,
        blocked: false,
        onRepair: fn().mockName('repair'),
    },
    argTypes: {
        repairs: { control: 'object' },
        gold: { control: { type: 'number', min: 0, step: 1 } },
        blocked: { control: 'boolean' },
        onRepair: { control: false },
    },
    render(args) {
        const host = renderVueStory(RepairWorkshop, { ...args })
        host.style.minHeight = '0'
        host.style.maxWidth = '560px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Blocked: Story = { args: { blocked: true } }
