import type {
    ExchangeSnapshot,
    QuestOfferSnapshot,
    QuestTurnInPromptSnapshot,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'

export function whisperFixture(): WhisperSnapshot {
    return {
        partnerId: 'partner',
        partnerName: 'Капля',
        available: true,
        messages: [{ id: '1', senderId: 'partner', text: 'Буль, слушаю.', at: 100 }],
    }
}
export function exchangeFixture(overrides: Partial<ExchangeSnapshot> = {}): ExchangeSnapshot {
    return {
        id: 'exchange-1',
        revision: 2,
        status: 'active',
        partnerId: 'partner',
        partnerName: 'Капля',
        incoming: false,
        own: { items: [], gold: 0, accepted: false, revision: 1 },
        other: {
            items: [{ instanceId: 'food-1', itemId: 'food' }],
            gold: 0,
            accepted: false,
            revision: 1,
        },
        ...overrides,
    }
}
export function questOfferFixture(): QuestOfferSnapshot {
    return {
        id: 'offer-1',
        revision: 3,
        issuerId: 'partner',
        issuerName: 'Мира',
        title: 'Доставить урожай',
        description: 'Нужна пшеница для города.',
        objectives: [{ kind: 'deliver', itemId: 'grain', quantity: 3, recipientId: 'warehouse' }],
        objectiveLabels: ['Доставить 3 пшеницы на городской склад.'],
        rewardGold: 10,
        rewardItems: [{ instanceId: 'reward-1', itemId: 'food' }],
        funding: 'city',
        rewardMode: 'party_equal',
        itemRecipient: 'submitter',
        expiresAt: 200_000,
    }
}

export function questTurnInFixture(): QuestTurnInPromptSnapshot {
    return {
        id: 'confirm-1',
        instanceId: 'contract-1',
        source: 'npc',
        issuerId: 'mira',
        issuerName: 'Мира',
        title: 'Доставить кость',
        description: 'Принесите трофей.',
        objectives: [],
        objectiveLabels: ['Кость получена'],
        rewardGold: 15,
        rewardItems: [{ instanceId: 'apple-1', itemId: 'food' }],
        rewardMode: 'party_equal',
        revision: 2,
        expiresAt: 30_000,
    }
}
