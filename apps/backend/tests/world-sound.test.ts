import {
    CENTER_LOCATION_ID,
    containerBounds,
    type GameEventKind,
    type GameEventPayload,
    type ServerMessage,
    type Vector2,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { observeCombatEvent } from '../src/game/combatEventObservation'
import { GameRoom } from '../src/game/room'
import { projectWorldSound, withWorldSound } from '../src/game/worldSound'
import {
    chestHero,
    chestId,
    chestNavigation,
    chestPosition,
    joinChestRoom,
    now,
} from './chestTestHelpers'
import { fixture as harvestFixture } from './harvestTestHelpers'

afterEach(() => {
    vi.unstubAllGlobals()
})

it('delivers one container sound to nearby sockets and only one private sound for a bulk take', () => {
    vi.stubGlobal('Bun', { env: {} })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const room = new GameRoom(chestNavigation('audio-test'))
    try {
        const player = joinChestRoom(room, 'Opener')
        const nearby = joinChestRoom(room, 'Nearby')
        const far = joinChestRoom(room, 'Far')
        const away = joinChestRoom(room, 'Away')
        nearby.actor.position = { x: 152, y: 72 }
        far.actor.position = { x: 300, y: 72 }
        away.actor.locationId = 'map-1-2'
        const open = { type: 'open_chest', chestId }
        room.handleMessage(player.socket, JSON.stringify(open))
        room.handleMessage(player.socket, JSON.stringify(open))
        const opening = eventsOfKind(player.sent, 'chest_open')
        expect(opening).toMatchObject([
            {
                actorId: player.actor.id,
                chestId,
                audioCue: {
                    effect: 'chestOpen',
                    locationId: player.actor.locationId,
                    position: chestPosition,
                },
            },
        ])
        expect(eventsOfKind(nearby.sent, 'chest_open')).toEqual(opening)
        expect(eventsOfKind(far.sent, 'chest_open')).toEqual([
            { actorId: player.actor.id, chestId, kind: 'chest_open' },
        ])
        expect(eventsOfKind(away.sent, 'chest_open')).toEqual([])
        room.handleMessage(
            player.socket,
            JSON.stringify({ type: 'take_all_chest_items', chestId })
        )
        const take = eventsOfKind(player.sent, 'item_pickup')
        expect(take).toHaveLength(3)
        expect(
            take.filter((event) => event.audioCue !== undefined)
        ).toHaveLength(1)
        expect(eventsOfKind(nearby.sent, 'item_pickup')).toEqual([])
    } finally {
        room.stop()
    }
})

it('applies wall occlusion without treating the source footprint as a wall', () => {
    const navigation = chestNavigation()
    const listener = chestHero('listener', { x: 56, y: 72 })
    const source: Vector2 = { x: 104, y: 72 }
    const event = withWorldSound(
        { kind: 'chest_open' },
        'chestOpen',
        CENTER_LOCATION_ID,
        source,
        { sourceBounds: containerBounds(source) }
    )
    navigation.grid.solid[4 * navigation.grid.width + 6] = true
    const view = {
        observer: listener,
        navigation,
        now,
        getCharacter: () => undefined,
    }
    const clear = projectWorldSound(event, view)
    expect(clear).toMatchObject({ effect: 'chestOpen', position: source })
    expect(clear?.obstructed).toBeUndefined()

    navigation.grid.solid[4 * navigation.grid.width + 5] = true
    expect(projectWorldSound(event, view)).toEqual({
        ...clear,
        obstructed: true,
    })
    listener.position = { x: source.x + 160, y: source.y }
    expect(projectWorldSound(event, view)).toBeUndefined()
    listener.position = { ...source }
    listener.locationId = 'map-1-2'
    expect(projectWorldSound(event, view)).toBeUndefined()
})

it('hides precise actor sounds and leaves a nearby public object cue anonymous', () => {
    const listener = chestHero('listener', { x: 88, y: 72 })
    const actor = chestHero('actor', { x: 136, y: 72 })
    actor.movement.mode = 'sneaking'
    const navigation = chestNavigation()
    navigation.grid.solid[4 * navigation.grid.width + 6] = true
    const view = {
        observer: listener,
        navigation,
        now,
        getCharacter: (id: string) => (id === actor.id ? actor : undefined),
    }
    const source = { sourceActorId: actor.id }
    const drink = withWorldSound(
        { kind: 'water_drink', actorId: actor.id },
        'drink',
        actor.locationId,
        actor.position,
        source
    )
    expect(projectWorldSound(drink, view)).toBeUndefined()
    expect(observeCombatEvent(drink, view)?.actorId).toBeUndefined()
    const chest = withWorldSound(
        { kind: 'chest_open', actorId: actor.id, chestId: 'chest' },
        'chestOpen',
        actor.locationId,
        { x: 120, y: 72 }
    )
    expect(observeCombatEvent(chest, view)?.actorId).toBeUndefined()
    expect(projectWorldSound(chest, view)).toMatchObject({
        position: { x: 120, y: 72 },
        obstructed: true,
    })

    const privateEvent = withWorldSound(
        { kind: 'item_pickup', actorId: actor.id, audienceIds: [actor.id] },
        'pickup',
        actor.locationId,
        actor.position
    )
    expect(projectWorldSound(privateEvent, view)).toBeUndefined()
    expect(
        projectWorldSound(privateEvent, { ...view, observer: actor })
    ).toMatchObject({ effect: 'pickup' })
    listener.alive = false
    expect(projectWorldSound(chest, view)).toBeUndefined()
})

it('uses one chop sound per strike, including the strike with multiple outputs', () => {
    const { actor, clock, navigation, node, gather } = harvestFixture('tree', 1)
    const view = {
        observer: actor,
        navigation,
        now,
        getCharacter: () => actor,
    }
    for (const outputCount of [1, 1, 3]) {
        const events = gather()
        expect(events).toHaveLength(outputCount)
        const cues = events.flatMap(
            (event) => projectWorldSound(event, view) ?? []
        )
        expect(cues).toMatchObject([
            { effect: 'chop', position: node.position },
        ])
        clock.now += 2_000
    }
    expect(gather()).toEqual([])
})

it('preserves the original source and receipt when decorating a combat impact', () => {
    const listener = chestHero('listener')
    const position = { ...listener.position }
    const event: GameEventPayload = withWorldSound(
        { kind: 'damage', targetId: listener.id },
        'hit',
        listener.locationId,
        position,
        { sourceActorId: listener.id }
    )
    const impact = Object.assign(event, { delivery: 'magic' as const })
    const view = {
        observer: listener,
        navigation: chestNavigation(),
        now,
        getCharacter: () => listener,
    }
    position.x += 100
    expect(projectWorldSound(impact, view)).toMatchObject({
        effect: 'hit',
        position: listener.position,
    })
})

function eventsOfKind(sent: ServerMessage[], kind: GameEventKind) {
    return sent.flatMap((message) =>
        message.type === 'event' && message.event.kind === kind
            ? [message.event]
            : []
    )
}
