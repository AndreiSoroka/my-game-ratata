import type { GuildQuestSnapshot, WorkRequestSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import GuildQuestCard from './GuildQuestCard.vue'

interface StoryArgs {
    job: GuildQuestSnapshot
    playerId: string
    canAbandon: boolean
    onAbandon: (instanceId: string) => void
}

const contract: GuildQuestSnapshot = {
    id: 'slime_hunt',
    instanceId: 'guild-contract-1',
    title: 'Зачистка троп',
    description: 'Победите трёх враждебных слизней.',
    goal: 3,
    rewardGold: 30,
    rewardMode: 'party_equal',
    progress: 3,
    status: 'ready',
    participants: [
        { id: 'self', nickname: 'Мира', contribution: 2, eligible: true },
        { id: 'late', nickname: 'Лада', contribution: 1, eligible: true },
    ],
}

const workRequest: WorkRequestSnapshot = {
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
}

const workerContract: GuildQuestSnapshot = {
    ...contract,
    id: workRequest.id,
    title: 'Помочь фермеру вернуться к работе',
    description: 'На ферме появились скелеты. Агафья ждёт помощи у распорядителя.',
    goal: 1,
    progress: 0,
    status: 'active',
    participants: [],
    workRequest,
}

const meta = {
    title: 'Entities/quests/GuildQuestCard',
    args: {
        job: contract,
        playerId: 'self',
        canAbandon: true,
        onAbandon: fn().mockName('abandon'),
    },
    argTypes: {
        job: { control: 'object' },
        playerId: { control: 'text' },
        canAbandon: { control: 'boolean' },
        onAbandon: { control: false },
    },
    render(args) {
        const host = renderVueStory(GuildQuestCard, { ...args })
        host.style.minHeight = '0'
        host.style.maxWidth = '540px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const AwaitingProof: Story = { args: { job: workerContract } }

export const TrialBlocked: Story = {
    args: {
        job: {
            ...workerContract,
            description: 'Работник проверяет возможность безопасно работать.',
            workRequest: {
                ...workRequest,
                stage: 'working',
                proofAccepted: true,
                reason: 'Пшеница ещё растёт. Работник дождётся настоящего урожая.',
            },
        },
    },
}

export const SharedReward: Story = {
    args: {
        job: {
            ...contract,
            status: 'completed',
            rewardShares: [
                { characterId: 'self', gold: 15 },
                { characterId: 'late', gold: 15 },
            ],
            rewardItems: [{ instanceId: 'guild-reward-food', itemId: 'food' }],
        },
    },
}
