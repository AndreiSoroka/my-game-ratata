import type { CharacterSnapshot, QuestOfferSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import QuestTerms from './QuestTerms.vue'

const offer: QuestOfferSnapshot = {
    id: 'grain-offer',
    revision: 1,
    issuerId: 'mira',
    issuerName: 'Мира',
    title: 'Доставить урожай',
    description: 'Нужна пшеница для города.',
    objectives: [{ kind: 'deliver', itemId: 'grain', quantity: 3, recipientId: 'city:warehouse' }],
    rewardGold: 10,
    rewardItems: [{ instanceId: 'reward', itemId: 'food', quantity: 2 }],
    funding: 'city',
    rewardMode: 'party_equal',
    itemRecipient: 'submitter',
    expiresAt: 30_000,
}
type Args = {
    offer: QuestOfferSnapshot
    characters: CharacterSnapshot[]
    progress?: number[]
    detailsOnly?: boolean
}
const meta = {
    title: 'Entities/quests/QuestTerms',
    parameters: { backgrounds: { disable: false } },
    args: { offer, characters: [], progress: [1], detailsOnly: false },
    render: (args) => renderVueStory(QuestTerms, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const ObjectivesOnly: Story = { args: { detailsOnly: true } }
