import type { GuildQuestSnapshot, WorkRequestSnapshot } from '@my-game-ratata/contracts'

export function workRequestFixture(
    overrides: Partial<WorkRequestSnapshot> = {}
): WorkRequestSnapshot {
    return {
        id: 'work-request-1',
        cityId: 'map-2-2',
        clerkId: 'npc_friendly_girl_1',
        workerId: 'npc_farmer_1',
        workerName: 'Фермер Агафья',
        locationId: 'map-2-1',
        locationName: 'Северные предместья',
        enemyName: 'Скелет',
        requiredTrophyItemId: 'bone',
        proofAccepted: false,
        stage: 'waiting',
        reason: null,
        ...overrides,
    }
}

export function guildQuestFixture(overrides: Partial<GuildQuestSnapshot> = {}): GuildQuestSnapshot {
    return {
        id: 'slime_hunt',
        instanceId: 'guild-contract-1',
        title: 'Зачистка троп',
        description: 'Победите трёх враждебных слизней.',
        goal: 3,
        rewardGold: 30,
        rewardMode: 'party_equal',
        progress: 2,
        status: 'active',
        participants: [],
        ...overrides,
    }
}
