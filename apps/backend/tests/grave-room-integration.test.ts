import {
    CENTER_LOCATION_ID,
    type ClientMessage,
    GRAVE_PURIFY_CAST_MS,
    HUMAN_MELEE_RULES,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { buildNpcAiObservation } from '../src/ai/observation'
import { grantRetaliation } from '../src/game/crimeRelations'
import { createItemInstance } from '../src/game/inventory'
import { magicAttackWindingUp } from '../src/game/magicState'
import { NavigationService } from '../src/game/navigation'
import { GameRoom, type GameRoomOptions } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})
const target = { kind: 'grave', id: 'test-grave' } as const
const leiaId = 'npc_princess_1'

function fixture(
    heroClass: 'cleric' | 'ranger' = 'cleric',
    options?: GameRoomOptions
) {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(10000)
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
        encounters: {
            graves: [
                {
                    id: target.id,
                    locationId: CENTER_LOCATION_ID,
                    position: { x: 104, y: 72 },
                },
            ],
            slimeHabitats: [],
        },
    })
    const room = new GameRoom(navigation, options)
    const messages: ServerMessage[] = []
    const socket = {
        send(text: string) {
            messages.push(JSON.parse(text) as ServerMessage)
        },
    } as RoomSocket
    const send = (command: ClientMessage) =>
        room.handleMessage(socket, JSON.stringify(command))
    room.handleOpen(socket)
    send({ type: 'join', nickname: 'GraveTester', heroClass })
    const init = messages.find((message) => message.type === 'world_init')
    if (init === undefined) {
        throw new Error('Join failed')
    }
    const actor = room.getCharacter(init.playerId)
    if (actor === undefined) {
        throw new Error('Actor missing')
    }
    actor.position = { x: 90, y: 72 }
    actor.exactCombatNumbers = true
    const grave = () =>
        room
            .snapshot(Date.now(), CENTER_LOCATION_ID, actor.id)
            .graves?.find((entry) => entry.id === target.id)
    const graveHp = () => {
        const health = grave()?.health
        return health?.kind === 'exact' ? health.current : undefined
    }
    return { room, actor, send, grave, graveHp, messages }
}

function nearbyLeia(room: GameRoom) {
    const leia = room.getCharacter(leiaId)
    if (leia === undefined) {
        throw new Error('Missing Leia fixture')
    }
    leia.position = { x: 90, y: 72 }
    return leia
}

it('sends the remembered grave name with observer health and keeps snapshots detached', () => {
    const f = fixture()
    f.actor.exactCombatNumbers = false
    const snapshot = f.grave()
    if (snapshot === undefined) {
        throw new Error('Missing grave snapshot')
    }
    const buriedName = snapshot.buriedName
    expect(buriedName.trim().length).toBeGreaterThan(0)
    expect(snapshot.health).toEqual({ kind: 'percent', percent: 100 })
    expect(snapshot).not.toHaveProperty('hp')
    snapshot.buriedName = 'Подменённое имя'
    expect(f.grave()?.buriedName).toBe(buriedName)
})

function leiaModelFixture() {
    const provider = controlledNpcProvider()
    const config = parseNpcAiConfig(
        {
            proactive: false,
            npcs: [{ actorId: leiaId, role: 'companion' }],
        },
        true
    )
    const f = fixture('cleric', { ai: { config, provider } })
    const leia = nearbyLeia(f.room)
    f.actor.position.x = 80
    return { ...f, provider, leia }
}

it('lets Leia make explicit strikes with her normal combat capability', () => {
    const f = fixture()
    const leia = nearbyLeia(f.room)
    f.actor.position.x = 80
    f.room.start()
    try {
        expect(leia.soul.companion?.canFight).toBe(false)
        expect(leia.abilities.known.has('pray_road')).toBe(true)
        expect(leia.abilities.known.has('pray')).toBe(false)
        const attack = { type: 'attack', target } as const
        const characterAttack = {
            type: 'attack',
            targetId: f.actor.id,
        } as const
        expect(f.room.decideForAgent(leiaId, characterAttack).accepted).toBe(
            false
        )
        expect(f.room.decideForAgent(leiaId, attack).accepted).toBe(true)
        expect(f.room.decideForAgent(leiaId, attack).accepted).toBe(false)
        expect(f.graveHp()).toBe(100)
        vi.advanceTimersByTime(HUMAN_MELEE_RULES.cycleMs + 50)
        expect(f.graveHp()).toBeLessThan(100)

        grantRetaliation(leia, f.actor, Date.now() + 5_000)
        expect(f.room.decideForAgent(leiaId, characterAttack).accepted).toBe(
            true
        )
        vi.advanceTimersByTime(HUMAN_MELEE_RULES.cycleMs + 50)
        expect(
            f.messages.some(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'damage' &&
                    message.event.actorId === leiaId &&
                    message.event.targetId === f.actor.id
            )
        ).toBe(true)
    } finally {
        f.room.stop()
    }
})

it('offers Leia only earned attack targets and a reachable approach to a distant grave', () => {
    const f = fixture()
    const leia = nearbyLeia(f.room)
    const observed = () =>
        buildNpcAiObservation(
            f.room,
            leia,
            'companion',
            Date.now()
        ).targets.find(
            (entry) => entry.kind === 'grave' && entry.id === target.id
        )
    expect(observed()?.commands).toEqual([{ type: 'attack', target }])
    expect(observed()?.details['health']).toMatchObject({ kind: 'percent' })
    leia.position.x = 60
    expect(observed()?.commands).toEqual([
        { type: 'move_to', target: { x: 95, y: 72 } },
    ])
    vi.spyOn(f.room.navigationFor(leia), 'hasLineOfSight').mockReturnValue(
        false
    )
    expect(observed()).toBeUndefined()
})

it.each([
    { status: 'completed', reason: 'attack_hit' },
    { status: 'failed', reason: 'attack_missed' },
])(
    'reports $reason only when the authoritative attack resolves',
    async ({ status, reason }) => {
        const f = leiaModelFixture()
        const { leia, provider } = f
        f.room.start()
        try {
            f.send({
                type: 'companion_request',
                request: 'talk',
                targetId: leiaId,
                text: 'Покажи, как ударить по камню.',
            })
            await vi.advanceTimersByTimeAsync(100)
            expect(provider.turns).toHaveLength(1)
            expect(
                provider.turns[0]?.context.commandCapabilities?.canFight
            ).toBe(true)
            const decision = { type: 'attack', target } as const
            provider.turns[0]?.resolve(
                npcReply(decision, {
                    taskAcceptance: 'accept',
                    speech: 'Попробую ударить.',
                    done: false,
                })
            )
            await vi.advanceTimersByTimeAsync(50)
            expect(leia.pendingAttack?.target).toEqual(target)
            expect(provider.turns).toHaveLength(1)
            expect(f.graveHp()).toBe(100)
            if (status === 'failed') {
                const navigation = f.room.navigationFor(leia)
                const original = navigation.hasLineOfSight.bind(navigation)
                vi.spyOn(navigation, 'hasLineOfSight').mockImplementation(
                    (from, to) =>
                        (to.x !== 104 || to.y !== 72) && original(from, to)
                )
            }
            await vi.advanceTimersByTimeAsync(HUMAN_MELEE_RULES.cycleMs + 50)
            if (status === 'completed') {
                expect(f.graveHp()).toBeLessThan(100)
            } else {
                expect(f.graveHp()).toBe(100)
            }
            expect(provider.turns[1]?.context.events).toContainEqual(
                expect.objectContaining({
                    kind: 'action',
                    status,
                    reason,
                    decision,
                })
            )
        } finally {
            f.room.stop()
        }
    }
)

it('reports a landed strike that a barrier fully absorbs as blocked', async () => {
    const f = leiaModelFixture()
    f.actor.abilities.known.add('barrier')
    grantRetaliation(f.leia, f.actor, Date.now() + 5_000)
    f.room.start()
    try {
        f.send({ type: 'use_ability', abilityId: 'barrier' })
        const decision = { type: 'attack', targetId: f.actor.id } as const
        f.send({
            type: 'whisper',
            targetId: leiaId,
            text: 'Попробуй ударить по моему барьеру.',
        })
        await vi.advanceTimersByTimeAsync(100)
        expect(f.actor.abilities.barrier).not.toBeNull()
        expect(f.provider.turns).toHaveLength(1)
        expect(
            f.provider.turns[0]?.context.observation.targets.find(
                (entry) => entry.id === f.actor.id
            )?.commands
        ).toContainEqual(decision)
        f.provider.turns[0]?.resolve(
            npcReply(decision, {
                taskAcceptance: 'accept',
                speech: 'Попробую ударить.',
                done: false,
            })
        )
        await vi.advanceTimersByTimeAsync(50)
        expect(
            f.leia.pendingAttack?.targetId,
            JSON.stringify(f.provider.turns[1]?.context.replyCorrection)
        ).toBe(f.actor.id)
        await vi.advanceTimersByTimeAsync(HUMAN_MELEE_RULES.cycleMs + 50)
        expect(f.actor.hp).toBe(f.actor.maxHp)
        expect(f.provider.turns[1]?.context.events).toContainEqual(
            expect.objectContaining({
                kind: 'action',
                status: 'failed',
                reason: 'attack_blocked',
                decision,
            })
        )
    } finally {
        f.room.stop()
    }
})

it('delays a Quick Shot while held movement pauses, then releases it from the aimed position', () => {
    const f = fixture('ranger')
    const position = { ...f.actor.position }
    const events = () =>
        f.messages.flatMap((message) =>
            message.type === 'event' ? [message.event] : []
        )
    f.room.start()
    try {
        f.send({ type: 'move_input', axis: { x: 0, y: 1 } })
        f.send({ type: 'use_ability', abilityId: 'shot', target })
        expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 1 })
        const start = events().find(
            (event) => event.kind === 'attack' && event.phase === 'started'
        )
        expect(start).toMatchObject({ abilityId: 'shot', durationMs: 200 })
        expect(start?.projectile).toBeUndefined()

        vi.advanceTimersByTime(150)
        expect(f.actor.position).toEqual(position)
        expect(f.graveHp()).toBe(100)
        vi.advanceTimersByTime(50)
        expect(f.actor.position).toEqual(position)
        expect(events()).toContainEqual(
            expect.objectContaining({
                actionId: start?.actionId,
                phase: 'completed',
                projectile: {
                    origin: position,
                    endpoint: { x: 104, y: 72 },
                },
            })
        )
        expect(f.graveHp()).toBeLessThan(100)
        vi.advanceTimersByTime(50)
        expect(f.actor.position.y).toBeGreaterThan(position.y)
    } finally {
        f.room.stop()
    }
})

describe('ordinary socket commands resolve grave actions in the real room', () => {
    it.each([
        { type: 'attack', target },
        { type: 'use_ability', abilityId: 'shot', target },
        { type: 'use_ability', abilityId: 'spark', target },
        { type: 'cast_spell', skillId: 'fireball', target },
        {
            type: 'auto_action',
            action: { kind: 'ability', abilityId: 'shot', target },
        },
    ] satisfies ClientMessage[])(
        'applies $type only after the shared pending hit',
        (command) => {
            const f = fixture('ranger')
            f.actor.abilities.known.add('spark')
            f.actor.abilities.known.add('fireball')
            f.actor.equipment.weapon = createItemInstance('pickaxe')
            expect(f.graveHp()).toBe(100)
            f.send(command)
            expect(f.graveHp()).toBe(100)
            f.room.start()
            vi.advanceTimersByTime(600)
            f.room.stop()
            expect(
                f.graveHp(),
                JSON.stringify({
                    command,
                    position: f.actor.position,
                    zones: f.actor.attackZones,
                    events: f.messages.filter(
                        (message) => message.type === 'event'
                    ),
                })
            ).toBeLessThan(100)
            expect(
                f.messages.some(
                    (message) =>
                        message.type === 'event' &&
                        message.event.kind === 'world_damage'
                )
            ).toBe(true)
            expect(
                f.messages.some(
                    (message) =>
                        message.type === 'event' &&
                        message.event.kind === 'death'
                )
            ).toBe(false)
        }
    )
    // Fake time still runs every real room tick; allow CPU contention in the full suite.
    it('channels, cancels and contributes to purification through the same player socket', () => {
        const f = fixture()
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const command = {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'purify_grave', target },
        } as const
        f.room.start()
        f.send(command)
        expect(f.actor.abilities.casting?.mode).toBe('purify_grave')
        expect(f.actor.mana).toBe(f.actor.config.resources.maxMana - 5)
        f.send({ type: 'cancel_prayer' })
        expect(f.actor.mana).toBe(f.actor.config.resources.maxMana - 5)
        vi.advanceTimersByTime(10100)
        expect(f.grave()?.phase).toBe('active')
        expect(f.actor.mana).toBe(f.actor.config.resources.maxMana)
        f.send(command)
        expect(f.actor.mana).toBe(f.actor.config.resources.maxMana - 5)
        vi.advanceTimersByTime(GRAVE_PURIFY_CAST_MS - 50)
        expect(f.grave()?.phase).toBe('active')
        const mana = f.actor.mana
        vi.advanceTimersByTime(50)
        f.room.stop()
        expect(f.grave()?.phase).toBe('active')
        expect(f.grave()?.purification?.completed).toBe(1)
        expect(f.actor.mana).toBeCloseTo(
            Math.min(
                f.actor.config.resources.maxMana,
                mana + f.actor.config.resources.manaRegenIdle * 0.05
            )
        )
    }, 30_000)
})

it('preserves a due spell until the combat tick when another socket attack arrives between ticks', () => {
    const f = fixture('ranger')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    f.actor.abilities.known.add('spark')
    f.actor.abilities.known.add('fireball')
    f.room.start()
    try {
        vi.advanceTimersByTime(3)
        const mana = f.actor.mana
        f.send({ type: 'cast_spell', skillId: 'fireball', target })
        expect(f.actor.mana).toBe(mana - 15)
        expect(magicAttackWindingUp(f.actor)).toBe(true)
        vi.advanceTimersByTime(401)
        expect(Date.now()).toBe(10404)
        expect(f.graveHp()).toBe(100)
        const beforeRejected = f.actor.mana
        f.send({ type: 'use_ability', abilityId: 'spark', target })
        expect(f.actor.mana).toBe(beforeRejected)
        expect(magicAttackWindingUp(f.actor)).toBe(true)
        vi.advanceTimersByTime(46)
        expect(f.graveHp()).toBe(97.5)
        expect(magicAttackWindingUp(f.actor)).toBe(false)
        vi.advanceTimersByTime(100)
        expect(f.actor.attackZones).toEqual([])
        const hits = f.messages.filter(
            (message) =>
                message.type === 'event' &&
                message.event.kind === 'world_damage'
        )
        expect(hits).toHaveLength(1)
        expect(hits[0]).toMatchObject({
            event: { target, amount: 2.5, abilityId: 'fireball' },
        })
    } finally {
        f.room.stop()
    }
})
