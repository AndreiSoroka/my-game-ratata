import type { GuildQuestSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'

import { setGameLocale } from '@/shared/lib/i18n'

import GuildQuestCard from './GuildQuestCard.vue'

const job: GuildQuestSnapshot = {
    id: 'work-request',
    instanceId: 'contract-1',
    title: 'Рабочее поручение',
    description: 'Принесите трофей распорядителю.',
    goal: 1,
    rewardGold: 30,
    rewardMode: 'party_equal',
    progress: 0,
    status: 'active',
    participants: [],
    workRequest: {
        id: 'work-request',
        cityId: 'map-2-2',
        clerkId: 'npc_friendly_girl_1',
        workerId: 'npc_farmer_1',
        workerName: 'Фермер Агафья',
        locationId: 'map-1-2',
        locationName: 'Западные поля',
        enemyName: 'Скелет',
        requiredTrophyItemId: 'bone',
        proofAccepted: false,
        stage: 'waiting',
        reason: null,
    },
}

afterEach(() => {
    setGameLocale('ru')
    localStorage.removeItem('ratata.locale')
})

it.each([
    ['ru', 'Кость × 1', 'Подойдёт трофей, найденный раньше.'],
    ['en', 'Bone × 1', 'A trophy found earlier counts.'],
] as const)('shows only the required trophy in %s', (locale, trophy, hiddenHint) => {
    setGameLocale(locale)
    const card = mount(GuildQuestCard, { props: { job } })
    try {
        expect(card.get('li').text()).toBe(trophy)
        expect(card.text()).not.toContain(hiddenHint)
    } finally {
        card.unmount()
    }
})
