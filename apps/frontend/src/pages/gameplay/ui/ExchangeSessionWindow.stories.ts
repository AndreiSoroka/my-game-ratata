import type {
    CharacterSnapshot,
    ExchangeSnapshot,
    ItemInstanceSnapshot,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '@/game/testing/characterFixture'
import { exchangeFixture, whisperFixture } from '@/game/testing/socialFixtures'
import { renderVueStory } from '@/shared/lib/storybook'

import ExchangeSessionWindow from './ExchangeSessionWindow.vue'

const inventory: ItemInstanceSnapshot[] = [
    { instanceId: 'apple', itemId: 'food', quantity: 5 },
    { instanceId: 'sword', itemId: 'simple_sword', durability: 180 },
    { instanceId: 'grain', itemId: 'grain', quantity: 3 },
]
const own = {
    revision: 2,
    items: [{ ...inventory[0]!, quantity: 2 }, inventory[1]!],
    gold: 7,
    accepted: false,
}
function exchangeArgs(
    overrides: Partial<ExchangeSnapshot> = {},
    options: { unavailable?: boolean; overflow?: boolean } = {}
): Args {
    const exchange = exchangeFixture({
        other: {
            revision: 1,
            items: [{ instanceId: 'other-grain', itemId: 'grain', quantity: 3 }],
            gold: 0,
            accepted: false,
        },
        ...overrides,
    })
    const conversation = whisperFixture()
    conversation.partnerName = exchange.partnerName
    conversation.available = !options.unavailable
    conversation.messages = [
        { id: '1', senderId: 'self', text: 'Можем обменяться?', at: 100 },
        { id: '2', senderId: 'partner', text: 'Буль, выбирай. Я подожду.', at: 200 },
    ]
    const items = options.overflow
        ? Array.from({ length: 20 }, (_, i) => ({
              ...inventory[i % inventory.length]!,
              instanceId: `bag-${i}`,
          }))
        : inventory
    return {
        exchange,
        player: characterFixture('self', { inventory: items }),
        gold: 12,
        conversation,
    }
}

type Args = {
    exchange: ExchangeSnapshot
    player: CharacterSnapshot
    gold: number
    conversation?: WhisperSnapshot | null
}
const meta = {
    title: 'Pages/gameplay/ExchangeSessionWindow',
    args: exchangeArgs(),
    render: (args) => {
        const host = renderVueStory(ExchangeSessionWindow, { ...args })
        host.style.cssText = 'position:relative;min-height:100dvh;background:#354137'
        return host
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Draft: Story = { args: exchangeArgs() }
export const Submitted: Story = { args: exchangeArgs({ own }) }
export const Accepted: Story = {
    args: exchangeArgs({ own: { ...own, accepted: true } }),
}
export const Completed: Story = {
    args: exchangeArgs({
        status: 'completed',
        own: { ...own, accepted: true },
        other: { ...exchangeFixture().other, accepted: true },
    }),
}
export const Unavailable: Story = {
    args: exchangeArgs({ other: { items: [], gold: 0, accepted: false } }, { unavailable: true }),
}
export const Overflow: Story = {
    args: exchangeArgs(
        {
            partnerName: 'Капля, хранительница далёких болот и старых торговых дорог',
            other: {
                accepted: false,
                gold: 124,
                items: Array.from({ length: 20 }, (_, i) => ({
                    instanceId: `offer-${i}`,
                    itemId: 'grain',
                    quantity: 3,
                })),
            },
        },
        { overflow: true }
    ),
}
