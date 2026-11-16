import type {
    GuildQuestDefinition,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { GuildService, type WorkerGuildGateway } from '../src/game/guild'

function fixture() {
    const request: WorkRequestSnapshot = {
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
    const definition: GuildQuestDefinition = {
        id: request.id,
        title: 'Вернуть работу фермеру',
        description: 'Проверьте поле.',
        goal: 1,
        rewardGold: 30,
        workRequest: request,
    }
    const actor = new GameCharacter({
        id: 'hero',
        nickname: 'Герой',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 80, y: 80 },
    })
    const characters = new Map([[actor.id, actor]])
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
    const guild = new GuildService(gateway)
    const wallet = new AdventureService()
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

describe('worker contracts through the shared guild slot', () => {
    it('keeps a ready worker locked when an atomic payment fails and retries once', () => {
        const f = fixture()
        f.accept()
        f.request.stage = 'ready'
        f.guild.turnIn(
            'solo:hero',
            f.instance(),
            f.actor.id,
            f.members,
            f.characters,
            () => ({ ok: false, shares: [] }),
            2000
        )
        expect(f.gateway.complete).not.toHaveBeenCalled()
        expect(f.guild.snapshot('solo:hero')?.status).toBe('ready')
        f.turnIn()
        expect(f.gateway.complete).toHaveBeenCalledTimes(1)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(30)
    })

    it('clears a stale orphaned instance before accepting a different contract', () => {
        const f = fixture()
        f.accept()
        f.gateway.abandon(f.request.id, 'solo:hero', 2000)
        f.guild.accept(
            'solo:hero',
            'slime_hunt',
            f.actor.id,
            f.members,
            f.characters
        )
        expect(f.guild.snapshot('solo:hero')?.id).toBe('slime_hunt')
    })

    it('claims exclusively, gates payment on the worker’s return, and rechecks danger at hand-in', () => {
        const f = fixture()
        f.accept()
        f.accept('other-group')
        expect(f.guild.snapshot('other-group')).toBeNull()
        const instanceId = f.instance()
        f.guild.report('solo:hero', 'obsolete', f.actor, 1001)
        expect(f.gateway.report).not.toHaveBeenCalled()
        f.guild.report('solo:hero', instanceId, f.actor, 1002)
        f.turnIn()
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        f.request.stage = 'ready'
        f.unsafe(true)
        f.turnIn()
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        f.unsafe(false)
        f.turnIn('obsolete')
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        f.turnIn()
        f.turnIn(instanceId)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(30)
        expect(f.gateway.complete).toHaveBeenCalledTimes(1)
    })

    it('keeps a new instance safe from stale abandonment and report messages', () => {
        const f = fixture()
        f.accept()
        const old = f.instance()
        f.guild.abandon('solo:hero', 'obsolete', 1100)
        expect(f.gateway.abandon).not.toHaveBeenCalled()
        f.guild.abandon('solo:hero', old, 1101)
        f.accept()
        expect(f.instance()).not.toBe(old)
        f.guild.report('solo:hero', old, f.actor, 1102)
        f.guild.abandon('solo:hero', old, 1103)
        expect(f.guild.snapshot('solo:hero')?.status).toBe('active')
        expect(f.gateway.report).not.toHaveBeenCalled()
        expect(f.gateway.abandon).toHaveBeenCalledTimes(1)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
    })

    it('preserves the accepted instance when a solo actor forms a party and refreshes membership', () => {
        const f = fixture()
        f.accept()
        const id = f.instance()
        f.guild.moveJob('solo:hero', 'party_1')
        expect(f.guild.snapshot('solo:hero')).toBeNull()
        expect(f.guild.snapshot('party_1')?.instanceId).toBe(id)
        f.guild.update('party_1', f.members, f.characters)
        expect(f.gateway.refreshGroup).toHaveBeenLastCalledWith(
            'party_1',
            f.members
        )
        f.guild.refreshGroup('party_1', new Set())
        expect(f.gateway.refreshGroup).toHaveBeenLastCalledWith(
            'party_1',
            new Set()
        )
        expect(f.gateway.releaseGroup).not.toHaveBeenCalled()
    })

    it('shares one contract slot with static jobs and refuses a second acceptance', () => {
        const f = fixture()
        f.guild.accept(
            'solo:hero',
            'slime_hunt',
            f.actor.id,
            f.members,
            f.characters
        )
        f.accept()
        expect(f.gateway.accept).not.toHaveBeenCalled()
        expect(f.guild.snapshot('solo:hero')?.id).toBe('slime_hunt')
    })
})
