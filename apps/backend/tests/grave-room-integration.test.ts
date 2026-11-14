import {
    CENTER_LOCATION_ID,
    type ClientMessage,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
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
    const grave = () =>
        room
            .snapshot(Date.now(), CENTER_LOCATION_ID, actor.id)
            .graves?.find((entry) => entry.id === target.id)
    return { room, actor, send, grave, messages }
}

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
            f.actor.progression.skills.fireball.unlocked = true
            f.actor.equipment.weapon = createItemInstance('pickaxe')
            expect(f.grave()?.hp).toBe(100)
            f.send(command)
            expect(f.grave()?.hp).toBe(100)
            f.room.start()
            vi.advanceTimersByTime(600)
            f.room.stop()
            expect(
                f.grave()?.hp,
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
    it('channels, cancels and completes purification through the same player socket', () => {
        const f = fixture()
        const command = {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'purify_grave', target },
        } as const
        f.room.start()
        f.send(command)
        expect(f.actor.abilities.casting?.mode).toBe('purify_grave')
        f.send({ type: 'cancel_prayer' })
        vi.advanceTimersByTime(10100)
        expect(f.grave()?.phase).toBe('active')
        expect(f.actor.mana).toBe(f.actor.config.resources.maxMana)
        f.send(command)
        vi.advanceTimersByTime(9950)
        expect(f.grave()?.phase).toBe('active')
        const mana = f.actor.mana
        vi.advanceTimersByTime(50)
        f.room.stop()
        expect(f.grave()?.phase).toBe('purified')
        expect(f.actor.mana).toBe(mana - 20)
    })
})

it('preserves a due spell until the combat tick when another socket attack arrives between ticks', () => {
    const f = fixture('ranger')
    f.actor.abilities.known.add('spark')
    f.actor.progression.skills.fireball.unlocked = true
    f.room.start()
    try {
        vi.advanceTimersByTime(3)
        const mana = f.actor.mana
        f.send({ type: 'cast_spell', skillId: 'fireball', target })
        expect(f.actor.mana).toBe(mana - 12)
        const pending = structuredClone(f.actor.pendingAttack)
        const zones = structuredClone(f.actor.attackZones)
        expect(pending).toMatchObject({ target, rawDamage: 8, hitAt: 10403 })
        vi.advanceTimersByTime(401)
        expect(Date.now()).toBe(10404)
        expect(f.grave()?.hp).toBe(100)
        const beforeRejected = f.actor.mana
        f.send({ type: 'use_ability', abilityId: 'spark', target })
        expect(f.actor.mana).toBe(beforeRejected)
        expect(f.actor.pendingAttack).toEqual(pending)
        expect(f.actor.attackZones).toEqual(zones)
        vi.advanceTimersByTime(46)
        expect(f.grave()?.hp).toBe(98)
        expect(f.actor.pendingAttack).toBeUndefined()
        vi.advanceTimersByTime(100)
        expect(f.actor.attackZones).toEqual([])
        const hits = f.messages.filter(
            (message) =>
                message.type === 'event' &&
                message.event.kind === 'world_damage'
        )
        expect(hits).toHaveLength(1)
        expect(hits[0]).toMatchObject({
            event: { target, amount: 2, abilityId: 'fireball' },
        })
    } finally {
        f.room.stop()
    }
})
