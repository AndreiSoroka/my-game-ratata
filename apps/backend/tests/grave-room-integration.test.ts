import {
    CENTER_LOCATION_ID,
    type ClientMessage,
    GRAVE_PURIFY_CAST_MS,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { magicAttackWindingUp } from '../src/game/magicState'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})
const target = { kind: 'grave', id: 'test-grave' } as const

function fixture(heroClass: 'cleric' | 'ranger' = 'cleric') {
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
    const room = new GameRoom(navigation)
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
