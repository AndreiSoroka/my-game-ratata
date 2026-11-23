import {
    CENTER_LOCATION_ID,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { kaplyaSafetyActive } from '../src/game/companionSafety'
import { hasStar } from '../src/game/constellations'
import { distance } from '../src/game/math'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { existingNpc, waitForNpcAi } from './npcAiRoomHelpers'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
    rooms.splice(0).forEach((room) => room.stop())
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function fixture(id: string) {
    const navigation = new NavigationService({
        height: 20,
        id: 'companion-test',
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
        tileHeight: 16,
        tileWidth: 16,
        width: 20,
    })
    const room = new GameRoom(navigation, {
        ai: {
            config: parseNpcAiConfig(
                {
                    proactive: false,
                    npcs: [{ actorId: id, role: 'companion' }],
                },
                true
            ),
            provider: {
                decide: (context) => {
                    const follows = context.events.some(
                        (event) =>
                            event.kind === 'message' &&
                            event.text.startsWith('Пойдём')
                    )
                    const accepts =
                        follows &&
                        context.commandCapabilities?.orders.follow?.allowed ===
                            true
                    return Promise.resolve({
                        decision: null,
                        speech: accepts ? 'Пойду с тобой.' : 'Здравствуй.',
                        taskAcceptance: accepts ? 'accept' : 'none',
                        companionOrder: accepts ? 'follow' : null,
                        waitMs: 0,
                        memory: '',
                        done: true,
                    })
                },
            },
        },
    })
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Спутник')
    const npc = existingNpc(room, id)
    return { player, npc, room }
}

it('lets Leia cast the Road prayer while following a depleted ally', async () => {
    const { player, npc, room } = fixture('npc_princess_1')
    npc.position = { x: 96, y: 96 }
    player.actor.position = { x: 132, y: 96 }
    room.start()
    player.send({ type: 'interact', targetId: npc.id })
    await vi.advanceTimersByTimeAsync(150)
    player.send({ type: 'dialogue_choice', choiceId: 'close' })
    player.send({
        type: 'companion_request',
        targetId: npc.id,
        request: 'follow',
    })
    await waitForNpcAi(
        () => npc.soul.companion?.leaderId === player.actor.id,
        1_000
    )
    expect(hasStar(npc, 'life.root')).toBe(true)
    expect(hasStar(npc, 'prayer_road.walk')).toBe(true)
    expect(npc.progression.masteries.prayer_road.level).toBe(1)
    player.actor.energy = 12
    const position = { ...npc.position }
    await waitForNpcAi(
        () => npc.abilities.casting?.abilityId === 'pray_road',
        1_000
    )
    expect(npc.abilities.casting).toMatchObject({
        walkWhileCasting: true,
        targetId: player.actor.id,
    })
    player.send({ type: 'move_input', axis: { x: 0.4, y: 0 } })
    await vi.advanceTimersByTimeAsync(100)
    player.send({ type: 'move_input', axis: { x: 0, y: 0 } })
    expect(npc.position).not.toEqual(position)
    expect(npc.abilities.casting?.abilityId).toBe('pray_road')
    expect(npc.abilities.known.has('pray')).toBe(false)
})

it('sends Kaplya through an ordinary border and back home once the leader dies', async () => {
    const { player, npc, room } = fixture('npc_magic_slime_1')
    const east = worldLocationNeighbor(CENTER_LOCATION_ID, 'east')
    if (east === undefined) {
        throw new Error('The city needs an eastern route')
    }
    for (const entry of room.snapshot(room.gameplayNow(), east.id).characters) {
        if (entry.faction === 'monsters') {
            existingNpc(room, entry.id).tags.add('offline')
        }
    }
    npc.position = { x: 232, y: 168 }
    player.actor.position = { x: 250, y: 168 }
    room.start()
    player.send({
        type: 'companion_request',
        targetId: npc.id,
        request: 'follow',
    })
    await waitForNpcAi(
        () => npc.soul.companion?.leaderId === player.actor.id,
        1_000
    )
    player.send({ type: 'move_input', axis: { x: 1, y: 0 } })
    await waitForNpcAi(() => player.actor.locationId === east.id, 3_000)
    player.send({ type: 'move_input', axis: { x: 0, y: 0 } })
    await waitForNpcAi(() => npc.locationId === east.id, 5_000)
    player.actor.applyDamage(player.actor.hp, room.gameplayNow())
    await vi.advanceTimersByTimeAsync(100)
    expect(npc.soul.companion?.leaderId).toBeNull()
    expect(npc.locationId).toBe(east.id)
    await waitForNpcAi(() => npc.locationId === CENTER_LOCATION_ID, 6_000)
    await waitForNpcAi(() => !kaplyaSafetyActive(npc), 12_000)
    expect(npc.locationId).toBe(CENTER_LOCATION_ID)
    expect(npc.soul.companion?.leaderId).toBeNull()
})

it('lets visible danger interrupt Kaplya’s route and increases separation from it', async () => {
    const { npc, room } = fixture('npc_magic_slime_1')
    const east = worldLocationNeighbor(CENTER_LOCATION_ID, 'east')
    if (east === undefined) {
        throw new Error('The city needs an eastern route')
    }
    const enemyId = room
        .snapshot(room.gameplayNow(), east.id)
        .characters.find((actor) => actor.creatureType === 'ooze')?.id
    const enemy = existingNpc(room, enemyId ?? '')
    npc.position = { x: 112, y: 96 }
    enemy.position = { x: 160, y: 96 }
    enemy.locationId = CENTER_LOCATION_ID
    enemy.tags.add('offline')
    enemy.stunUntil = room.gameplayNow() + 10_000
    room.start()
    expect(
        room.decideForAgent(npc.id, {
            type: 'move_to',
            target: { x: 200, y: 96 },
        }).accepted
    ).toBe(true)
    enemy.tags.delete('offline')
    const before = distance(npc.position, enemy.position)
    await vi.advanceTimersByTimeAsync(500)
    expect(kaplyaSafetyActive(npc)).toBe(true)
    expect(distance(npc.position, enemy.position)).toBeGreaterThan(before)
    expect(npc.pendingAttack).toBeUndefined()
})

it('makes a real ranged attack with Bran and a real melee attack once the enemy closes', async () => {
    const { player, npc, room } = fixture('npc_veteran_1')
    const east = worldLocationNeighbor(CENTER_LOCATION_ID, 'east')
    if (east === undefined) {
        throw new Error('The city needs an eastern route')
    }
    npc.locationId = east.id
    const enemies = room
        .charactersFor(npc)
        .filter((actor) => actor.faction === 'monsters')
    const target = enemies.find((actor) => actor.archetype === 'slime')
    if (target === undefined) {
        throw new Error('Expected an ordinary enemy')
    }
    for (const enemy of enemies) {
        enemy.tags.add('offline')
    }
    npc.position = { x: 96, y: 96 }
    player.actor.position = { ...npc.position }
    player.actor.locationId = east.id
    target.tags.delete('offline')
    target.position = { x: 176, y: 96 }
    target.maxHp = 100
    target.hp = 100
    target.stunUntil = room.gameplayNow() + 10_000
    expect(hasStar(npc, 'blade.root')).toBe(true)
    expect(hasStar(npc, 'arrow.root')).toBe(true)
    room.start()
    await waitForNpcAi(() => npc.pendingAttack?.abilityId === 'shot', 1_000)
    await waitForNpcAi(() => target.hp < 100, 1_000)
    target.tags.add('offline')
    await vi.advanceTimersByTimeAsync(1_500)
    target.tags.delete('offline')
    target.position = { x: npc.position.x + 8, y: npc.position.y }
    await waitForNpcAi(
        () =>
            player.sent.some(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'attack' &&
                    message.event.actorId === npc.id &&
                    message.event.abilityId === undefined
            ),
        1_000
    )
    expect(npc.equipment.weapon?.itemId).toBe('old_sword')
})
