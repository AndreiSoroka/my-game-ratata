import type { ExchangeSnapshot, ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import ExchangeWindow from '../ui/ExchangeWindow.vue'
import { exchangeFixture, whisperFixture } from '../ui/socialFixtures'
import ExchangeConsentGallery from './ExchangeConsentGallery.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/ExchangeWindow' } satisfies Meta
export default meta
type Story = StoryObj

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
function exchangeStory(
    overrides: Partial<ExchangeSnapshot> = {},
    options: { unavailable?: boolean; overflow?: boolean } = {}
): HTMLElement {
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
    const host = renderVueStory(ExchangeWindow, {
        exchange,
        player: characterFixture('self', { inventory: items }),
        gold: 12,
        conversation,
    })
    host.style.cssText = 'position:relative;min-height:100dvh;background:#354137'
    return host
}

export const Draft: Story = { render: () => exchangeStory() }
export const Submitted: Story = { render: () => exchangeStory({ own }) }
export const Accepted: Story = {
    render: () => exchangeStory({ own: { ...own, accepted: true } }),
}
export const Completed: Story = {
    render: () =>
        exchangeStory({
            status: 'completed',
            own: { ...own, accepted: true },
            other: { ...exchangeFixture().other, accepted: true },
        }),
}
export const Unavailable: Story = {
    render: () =>
        exchangeStory({ other: { items: [], gold: 0, accepted: false } }, { unavailable: true }),
}
export const Overflow: Story = {
    render: () =>
        exchangeStory(
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
export const Consent: Story = { render: () => renderVueStory(ExchangeConsentGallery, {}) }
