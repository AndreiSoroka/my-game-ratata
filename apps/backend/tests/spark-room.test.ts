import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { roomTickMs } from '../src/game/roomLoop'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom | undefined

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup() {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const navigation = new NavigationService({
        id: 'spark-room-test',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
    room = new GameRoom(navigation)
    room.start()
    const { actor, sent, send } = joinScenarioRoom(
        room,
        'Spark tester',
        'arcanist'
    )
    return {
        room,
        actor,
        send,
        events: () =>
            sent.flatMap((message) =>
                message.type === 'event' &&
                message.event.actorId === actor.id &&
                message.event.abilityId === 'spark'
                    ? [message.event]
                    : []
            ),
    }
}

function receipts(f: ReturnType<typeof setup>, id: string | undefined) {
    expect(id).toBeDefined()
    return f
        .events()
        .filter(({ actionId }) => actionId === id)
        .map(({ kind, phase }) => phase ?? kind)
}

it('preserves a due Spark when a second socket cast arrives between ticks', () => {
    const f = setup()
    const offset = 3
    vi.advanceTimersByTime(offset)
    const cast = { type: 'use_ability', abilityId: 'spark' } as const
    f.send(cast)
    const paid = f.actor.pendingAttack
    vi.advanceTimersByTime(ABILITY_DEFINITIONS.spark.windupMs)
    expect(f.room.gameplayNow()).toBe(paid?.hitAt)
    expect(f.actor.abilities.availableAt.spark).toBe(paid?.hitAt)
    expect(receipts(f, paid?.actionId)).toEqual(['started'])
    const mana = f.actor.mana
    const energy = f.actor.energy

    f.send(cast)
    expect(f.actor.pendingAttack).toBe(paid)
    expect(f.actor.mana).toBe(mana)
    expect(f.actor.energy).toBe(energy)

    vi.advanceTimersByTime(roomTickMs - offset)
    expect(f.actor.pendingAttack).toBeUndefined()
    expect(receipts(f, paid?.actionId)).toEqual([
        'started',
        'completed',
        'miss',
    ])
    expect(f.events().filter(({ phase }) => phase === 'started')).toHaveLength(
        1
    )
}, 15_000)

it('resolves both auto-repeated Spark casts once when cooldown equals windup', () => {
    const f = setup()
    f.send({
        type: 'auto_action',
        action: { kind: 'ability', abilityId: 'spark' },
    })

    vi.advanceTimersByTime(roomTickMs)
    const first = f.actor.pendingAttack?.actionId
    expect(receipts(f, first)).toEqual(['started'])

    vi.advanceTimersByTime(ABILITY_DEFINITIONS.spark.windupMs)
    expect(f.actor.pendingAttack).toBeUndefined()
    expect(receipts(f, first)).toEqual(['started', 'completed', 'miss'])
    expect(f.events().filter(({ phase }) => phase === 'started')).toHaveLength(
        1
    )

    vi.advanceTimersByTime(roomTickMs)
    const second = f.actor.pendingAttack?.actionId
    expect(second).not.toBe(first)
    expect(receipts(f, second)).toEqual(['started'])
    vi.advanceTimersByTime(ABILITY_DEFINITIONS.spark.windupMs)
    expect(f.actor.pendingAttack).toBeUndefined()
    expect(receipts(f, first)).toEqual(['started', 'completed', 'miss'])
    expect(receipts(f, second)).toEqual(['started', 'completed', 'miss'])
    expect(f.events().filter(({ phase }) => phase === 'started')).toHaveLength(
        2
    )
}, 15_000)

it('publishes an interrupted Spark once if equipment invalidates the pending attack', () => {
    const f = setup()
    f.actor.equipment.weapon = createItemInstance('simple_sword')
    const offset = 3
    vi.advanceTimersByTime(offset)
    f.send({ type: 'use_ability', abilityId: 'spark' })
    const id = f.actor.pendingAttack?.actionId
    vi.advanceTimersByTime(ABILITY_DEFINITIONS.spark.windupMs)

    f.send({ type: 'equipment_action', slot: 'weapon', action: 'unequip' })
    expect(f.actor.equipment.weapon).toBeUndefined()
    expect(f.actor.pendingAttack).toBeUndefined()
    vi.advanceTimersByTime(roomTickMs * 2 - offset)

    expect(receipts(f, id)).toEqual(['started', 'interrupted'])
}, 15_000)
