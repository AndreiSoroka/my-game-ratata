import type {
    GuildQuestDefinition,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { GuildService, type WorkerGuildGateway } from '../src/game/guild'

function character(
    id: string,
    nickname: string,
    controllerKind: 'network_player' | 'scripted'
): GameCharacter {
    return new GameCharacter({
        id,
        nickname,
        archetype: 'human',
        controllerKind,
        faction: 'peaceful',
        spawnPosition: { x: 80, y: 80 },
    })
}

function requestFixture(): WorkRequestSnapshot {
    return {
        id: 'worker-request-1',
        cityId: 'map-2-2',
        clerkId: 'npc_friendly_girl_1',
        workerId: 'farmer',
        workerName: 'Фермер',
        locationId: 'map-2-1',
        locationName: 'Поле',
        enemyName: 'Скелет',
        requiredTrophyItemId: 'bone',
        proofAccepted: false,
        stage: 'waiting',
        reason: null,
    }
}

export function fixture() {
    const request = requestFixture()
    const definition: GuildQuestDefinition = {
        id: request.id,
        title: 'Вернуть работу фермеру',
        description: 'Проверьте поле.',
        goal: 1,
        rewardGold: 30,
        workRequest: request,
    }
    const actor = character('hero', 'Герой', 'network_player')
    const clerk = character(request.clerkId, 'Мира', 'scripted')
    const characters = new Map([
        [actor.id, actor],
        [clerk.id, clerk],
    ])
    let claimant: string | null = null
    let unsafe = false
    const gateway: WorkerGuildGateway = {
        list: () => [definition],
        active: (key) => (claimant === key ? request : null),
        accept: vi.fn((_id: string, key: string) => {
            if (claimant !== null) {
                return 'У обращения уже есть исполнитель.'
            }
            claimant = key
            return null
        }),
        report: vi.fn(() => {
            request.proofAccepted = true
            request.stage = 'outbound'
            return null
        }),
        checkTurnIn: () => (unsafe ? 'Рабочий участок снова опасен.' : null),
        complete: vi.fn(() => {
            request.stage = 'completed'
            claimant = null
            return true
        }),
        settle: (_id, key, payment) => {
            if (claimant !== key || request.stage !== 'ready' || !payment()) {
                return false
            }
            return gateway.complete(request.id, key)
        },
        abandon: vi.fn(() => {
            claimant = null
            request.stage = 'waiting'
            return null
        }),
        releaseGroup: vi.fn(),
        refreshGroup: vi.fn(),
        moveGroup: vi.fn((from: string, to: string) => {
            if (claimant === from) {
                claimant = to
            }
        }),
    }
    const wallet = new AdventureService()
    const guild = new GuildService(gateway, undefined, {
        funding: wallet.questFunding,
        walletFor: wallet.walletFor,
    })
    const members = new Set([actor.id])
    const accept = (key = 'solo:hero') =>
        guild.accept(
            key,
            request.id,
            actor.id,
            members,
            characters,
            'party_equal',
            1000
        )
    const instance = () => {
        const value = guild.snapshot('solo:hero')?.instanceId
        if (value === undefined) {
            throw new Error('Expected active job')
        }
        return value
    }
    const turnIn = (id = instance()) =>
        guild.turnIn(
            'solo:hero',
            id,
            actor.id,
            members,
            characters,
            wallet.grantQuestGoldOnce,
            2000
        )
    return {
        request,
        gateway,
        guild,
        wallet,
        actor,
        clerk,
        characters,
        members,
        accept,
        instance,
        turnIn,
        unsafe: (value: boolean) => {
            unsafe = value
        },
    }
}
