import type { GameEventPayload, ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { queueNpcCombatReactions } from '../src/ai/combatReactions'
import { defaultNpcAiSettings, parseNpcAiConfig } from '../src/ai/config'
import { createNpcAiState } from '../src/ai/runtimeState'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import { hasRetaliationRight } from '../src/game/crimeRelations'
import { damageEvent } from '../src/game/damageEvents'
import { npcAiRoster } from '../src/game/npcRoster'
import { GameRoom } from '../src/game/room'
import { savvaEntryTiles } from '../src/game/savvaTerritoryVisits'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const savvaId = 'npc_necromancer_1'
let room: GameRoom | undefined

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
})

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
})

it('starts a genuine temporary model turn for a witnessed hit and cools down per NPC', async () => {
    const f = setup()
    expect(f.savva.soul.kind).toBe('echo')
    f.hit()
    await vi.advanceTimersByTimeAsync(75)
    expect(f.provider.turns).toHaveLength(1)
    const turn = required(f.provider.turns[0])
    expect(f.savva.soul).toMatchObject({
        kind: 'spark',
        controlSource: 'model',
    })
    expect(turn.context.events).toEqual([
        {
            kind: 'combat_hit',
            id: expect.any(String) as string,
            at: 10_000,
            attacker: { id: f.alice.actor.id, name: f.alice.actor.nickname },
            target: { id: f.bob.actor.id, name: f.bob.actor.nickname },
        },
    ])
    expect(turn.context.observation.targets).toEqual([])
    expect(turn.context.conversation).toBeUndefined()
    turn.resolve(npcReply(null, { speech: 'Осторожнее с клинком.' }))
    await vi.advanceTimersByTimeAsync(100)
    expect(lines(f.alice.sent)).toEqual(['Осторожнее с клинком.'])
    expect(lines(f.bob.sent)).toEqual(['Осторожнее с клинком.'])
    expect(f.savva.soul).toMatchObject({
        kind: 'echo',
        controlSource: 'script',
    })

    vi.setSystemTime(69_999)
    f.placeParticipants()
    f.hit()
    await vi.advanceTimersByTimeAsync(75)
    expect(f.provider.turns).toHaveLength(1)
    vi.setSystemTime(70_100)
    f.placeParticipants()
    f.hit()
    await vi.advanceTimersByTimeAsync(75)
    expect(f.provider.turns).toHaveLength(2)
})

it('ignores private, unconfirmed, distant, hidden, and cross-location damage observations', async () => {
    const f = setup()
    let occurrence = 0
    const publish = (event: Partial<GameEventPayload>) =>
        f.room.publishEvents([
            {
                kind: 'damage',
                eventId: `fixture-hit:${String(++occurrence)}`,
                actorId: f.alice.actor.id,
                targetId: f.bob.actor.id,
                amount: 2,
                ...event,
            },
        ])
    publish({ kind: 'attack' })
    publish({ kind: 'miss' })
    publish({ amount: 0 })
    publish({ audienceIds: [f.alice.actor.id] })
    publish({ position: { x: f.savva.position.x + 81, y: f.savva.position.y } })
    const originalLocation = f.alice.actor.locationId
    f.alice.actor.locationId = 'map-2-2'
    publish({})
    f.alice.actor.locationId = originalLocation

    const navigation = f.room.navigationFor(f.savva)
    const sight = vi.spyOn(navigation, 'hasLineOfSight').mockReturnValue(false)
    publish({})
    sight.mockRestore()

    f.savva.locationId = 'map-2-2'
    const city = f.room.navigationFor(f.savva)
    const building = required(
        city.grid.buildings?.find(({ name }) => name === 'Гильдия искателей')
    )
    f.savva.position = {
        x: building.entry.x,
        y: building.bounds.y + building.bounds.height,
    }
    for (const player of [f.alice.actor, f.bob.actor]) {
        player.locationId = f.savva.locationId
        player.position = { ...building.interior }
    }
    const clearSight = vi.spyOn(city, 'hasLineOfSight').mockReturnValue(true)
    publish({})
    const dummy = required(
        f.room
            .charactersFor(f.savva)
            .find(({ trainingTarget }) => trainingTarget !== undefined)
    )
    f.savva.position = { ...dummy.position }
    f.alice.actor.position = { ...dummy.position }
    publish({ targetId: dummy.id })
    clearSight.mockRestore()
    await vi.advanceTimersByTimeAsync(100)
    expect(f.provider.turns).toHaveLength(0)
})

it('records distinct damage occurrences from one action and never rerolls copied or unreceipted hits', () => {
    const f = setup(false)
    const reaction = vi.spyOn(f.savva.temperament, 'react')
    const emitHit = () => ({
        ...damageEvent(
            {
                actor: f.alice.actor,
                target: f.savva,
                now: f.room.gameplayNow(),
                amount: 2,
                damageKind: 'physical',
                respawnDelayMs: 1_000,
            },
            2,
            false
        ),
        actionId: 'same-action',
    })
    const first = emitHit()
    const second = emitHit()
    expect(first.eventId).toEqual(expect.any(String))
    expect(second.eventId).toEqual(expect.any(String))
    expect(second.eventId).not.toBe(first.eventId)

    const incidents = () =>
        f.room.social.society.history
            .knownIncidents(f.savva.id, f.savva.locationId)
            .filter((incident) => incident.kind === 'attack')
    f.room.publishEvents([first, second])
    expect(incidents()).toHaveLength(2)
    expect(reaction).toHaveBeenCalledTimes(2)
    const initial = incidents()
    vi.setSystemTime(11_000)
    const withoutReceipt = { ...first }
    delete withoutReceipt.eventId
    f.room.publishEvents([
        structuredClone(first),
        { ...second },
        withoutReceipt,
    ])
    expect(incidents()).toEqual(initial)
    expect(reaction).toHaveBeenCalledTimes(2)

    const projected = f.bob.sent.flatMap((message) =>
        message.type === 'event' && message.event.kind === 'damage'
            ? [message.event]
            : []
    )
    expect(projected.length).toBeGreaterThan(0)
    for (const event of projected) {
        expect(event).not.toHaveProperty('amount')
        expect(event).not.toHaveProperty('eventId')
    }
})

it('lets bystanders notice a public hit without manufacturing assault evidence from unclassified damage', async () => {
    const f = setup()
    const { actor: attacker } = f.alice
    const { actor: victim } = f.bob
    const now = f.room.gameplayNow()
    f.room.publishEvents([
        {
            kind: 'damage',
            eventId: 'unclassified-hit',
            actorId: attacker.id,
            targetId: victim.id,
            amount: 2,
        },
    ])
    expect(
        f.room.social.society.history.knownIncidents(
            victim.id,
            victim.locationId
        )
    ).toEqual([])
    expect(
        f.room
            .snapshot(now, victim.locationId, victim.id)
            .characters.find((entry) => entry.id === victim.id)?.theft
            ?.accusations
    ).toEqual([])
    expect(hasRetaliationRight(attacker, victim, now)).toBe(false)
    await vi.advanceTimersByTimeAsync(75)
    expect(f.provider.turns[0]?.context.events).toMatchObject([
        { kind: 'combat_hit' },
    ])
})

it('queues the same reaction for all five active NPC profiles', () => {
    const f = setup()
    const states = Object.entries(npcAiRoster)
        .filter(([, { mode }]) => mode === 'controller')
        .map(([id, config]) => {
            const actor = required(f.room.getCharacter(id))
            const state = createNpcAiState(
                {
                    actorId: id,
                    ...config,
                    mode: id === savvaId ? 'dialogue_only' : config.mode,
                    settings: defaultNpcAiSettings,
                },
                actor
            )
            actor.locationId = f.savva.locationId
            actor.position = { ...f.savva.position }
            return state
        })
    queueNpcCombatReactions(
        f.room,
        states,
        [
            {
                kind: 'damage',
                eventId: 'witnessed-hit-receipt',
                actorId: f.alice.actor.id,
                targetId: f.bob.actor.id,
                amount: 2,
            },
        ],
        f.room.gameplayNow(),
        () => 'witnessed-hit'
    )
    expect(
        states
            .filter((state) => state.events[0]?.kind === 'combat_hit')
            .map(({ config }) => config.actorId)
    ).toEqual([
        'npc_friendly_girl_1',
        savvaId,
        'npc_magic_slime_1',
        'npc_princess_1',
        'npc_veteran_1',
    ])
})

it('lets addressed player speech interrupt a combat turn without delivering the obsolete line', async () => {
    const f = setup()
    f.hit()
    await vi.advanceTimersByTimeAsync(75)
    const reaction = required(f.provider.turns[0])
    f.placeParticipants()
    f.alice.send({ type: 'chat', targetId: savvaId, text: 'Привет, Савва.' })
    await vi.advanceTimersByTimeAsync(100)
    expect(reaction.signal.aborted).toBe(true)
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[1]?.context.events[0]?.kind).toBe('message')
    reaction.resolve(npcReply(null, { speech: 'Запоздалая реплика.' }))
    f.provider.turns[1]?.resolve(npcReply(null, { speech: 'Приветствую.' }))
    await vi.advanceTimersByTimeAsync(100)
    expect(lines(f.alice.sent)).toEqual(['Приветствую.'])
})

it('drops a bystander reply when that NPC commits to a physical conflict response', async () => {
    const f = setup()
    f.hit()
    await vi.advanceTimersByTimeAsync(75)
    const turn = required(f.provider.turns[0])
    const conflict = required(f.room.social.society.conflicts)
    conflict.apply(
        f.savva,
        f.alice.actor,
        'attack',
        {
            id: 'observed-threat',
            kind: 'threat',
            locationId: f.savva.locationId,
        },
        f.room.gameplayNow()
    )
    expect(conflict.hasPhysicalReaction(f.savva, f.room.gameplayNow())).toBe(
        true
    )
    expect(
        f.room.decideForAgent(f.savva.id, {
            type: 'move',
            axis: { x: 1, y: 0 },
        }).accepted
    ).toBe(false)
    await vi.advanceTimersByTimeAsync(100)
    expect(turn.signal.aborted).toBe(true)
    expect(f.savva.soul.controlSource).toBe('script')
    turn.resolve(npcReply(null, { speech: 'Запоздалая реплика свидетеля.' }))
    await vi.advanceTimersByTimeAsync(250)
    expect(lines(f.alice.sent)).not.toContain('Запоздалая реплика свидетеля.')
})

it('rejects an action or lookup in a combat reply without a second model call', async () => {
    const f = setup()
    f.hit()
    await vi.advanceTimersByTimeAsync(75)
    f.provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target: { x: 32, y: 32 } },
            {
                speech: 'Лишняя реплика.',
                informationRequest: { type: 'knowledge_search', query: 'бой' },
            }
        )
    )
    await vi.advanceTimersByTimeAsync(300)
    expect(f.provider.turns).toHaveLength(1)
    expect(lines(f.alice.sent)).toEqual([])
    expect(f.savva.soul).toMatchObject({
        kind: 'echo',
        controlSource: 'script',
    })
})

it('respects the room setting that disables proactive model turns', async () => {
    const f = setup(false)
    f.hit()
    await vi.advanceTimersByTimeAsync(100)
    expect(f.provider.turns).toHaveLength(0)
})

function setup(proactive = true) {
    const provider = controlledNpcProvider()
    const game = new GameRoom(undefined, {
        worldSeed: 'npc-combat-reactions',
        initialBellState: 'active',
        ai: {
            provider,
            config: parseNpcAiConfig(
                {
                    proactive,
                    npcs: [{ actorId: savvaId, role: 'necromancer' }],
                },
                true
            ),
        },
    })
    room = game
    const alice = joinScenarioRoom(game, 'Alice')
    const bob = joinScenarioRoom(game, 'Bob')
    const savva = required(game.getCharacter(savvaId))
    const navigation = game.navigationFor(savva)
    const home = required(navigation.grid.encounters?.ashRefuge?.home)
    const neutralTile = required(
        navigation.findWalkableTileNear(
            navigation.worldToTile(home),
            (tile) => {
                const point = navigation.tileToWorld(tile)
                return (
                    Math.hypot(point.x - home.x, point.y - home.y) >
                    (savvaEntryTiles + 1) * navigation.grid.tileWidth
                )
            }
        )
    )
    const neutralPoint = navigation.tileToWorld(neutralTile)
    function placeParticipants(): void {
        savva.clearPath()
        savva.position = { ...neutralPoint }
        for (const actor of [alice.actor, bob.actor]) {
            actor.locationId = savva.locationId
            actor.position = { ...neutralPoint }
        }
    }
    placeParticipants()
    game.start()
    return {
        room: game,
        savva,
        alice,
        bob,
        provider,
        placeParticipants,
        hit: () => hit(game, alice.actor, bob.actor),
    }
}

function required<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Missing combat reaction fixture')
    }
    return value
}

function hit(
    room: GameRoom,
    actor: GameCharacter,
    target: GameCharacter
): void {
    const now = room.gameplayNow()
    room.publishEvents(
        resolveCharacterDamage({
            actor,
            target,
            now,
            amount: 2,
            damageKind: 'physical',
            respawnDelayMs: 1000,
        }).events
    )
}

function lines(messages: ServerMessage[]): Array<string | undefined> {
    return messages.flatMap((message) =>
        message.type === 'event' &&
        message.event.kind === 'chat' &&
        message.event.actorId === savvaId
            ? [message.event.text]
            : []
    )
}
