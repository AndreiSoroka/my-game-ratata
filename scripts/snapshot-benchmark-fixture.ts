import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    type ClientMessage,
    type ServerMessage,
    type SetViewportClientMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { GameCharacter } from '../apps/backend/src/game/character'
import { resolvePendingAttackHit } from '../apps/backend/src/game/combat'
import { advanceCharacter } from '../apps/backend/src/game/movement'
import { NavigationService } from '../apps/backend/src/game/navigation'
import { GameRoom } from '../apps/backend/src/game/room'
import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'
import { projectViewport } from '../apps/backend/src/game/viewportProjection'

export type BenchmarkScenario = 'idle-timers' | 'walking' | 'combat'

interface FixtureRoom {
    characters: Map<string, GameCharacter>
    controllers: Map<string, unknown>
}

/** Isolated fixture: no listening game server, live players, AI providers or timers. */
export function createBenchmarkFixture(actorCount: number) {
    let now = 1_000_000
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width: 100,
        height: 100,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(10_000).fill(false),
        solidLayerNames: [],
    })
    const room = new GameRoom(navigation, {
        worldClock: () => now,
        emptyWorldMode: 'always',
        npcIdentitySeed: 'snapshot-benchmark',
        npcSpeechSeed: 'snapshot-benchmark',
    })
    // Authored NPC controllers are intentionally frozen; fixture actors still use
    // the same GameCharacter, movement, combat and authorized snapshot services.
    const state = room as unknown as FixtureRoom
    state.characters.clear()
    state.controllers.clear()
    let playerId = ''
    const commandSocket = {
        data: { socketId: 'benchmark-controller' },
        getBufferedAmount: () => 0,
        send: (raw: string): number => {
            const message = JSON.parse(raw) as ServerMessage
            if (message.type === 'world_init') playerId = message.playerId
            assert.notEqual(message.type, 'error', raw)
            return Buffer.byteLength(raw)
        },
    } as unknown as RoomSocket
    const command = (message: ClientMessage) =>
        room.handleMessage(commandSocket, JSON.stringify(message))
    room.handleOpen(commandSocket)
    command({
        type: 'join',
        nickname: 'Snapshot Benchmark',
        heroClass: 'vanguard',
    })
    const hero = requiredActor(room, playerId)
    const actors = [hero, ...fixtureActors(hero, actorCount - 1)]
    const targetId = actors[1]?.id
    assert.ok(targetId)
    const attack: ClientMessage = { type: 'attack', targetId }
    for (const actor of actors) state.characters.set(actor.id, actor)
    const origin = { ...hero.position }
    let attackStarts = 0
    let movementSamples = 0

    function step(frame: number, scenario: BenchmarkScenario) {
        now += 50
        if (scenario === 'walking') {
            const axis = { x: Math.floor(frame / 20) % 2 === 0 ? 1 : -1, y: 0 }
            command({ type: 'move_input', axis })
            for (const actor of actors.slice(1)) actor.setMoveInput(axis)
        }
        if (scenario === 'combat' && frame % 20 === 0) {
            command(attack)
            if (hero.pendingAttack !== undefined) attackStarts += 1
        }
        for (const actor of actors) {
            const before = { ...actor.position }
            advanceCharacter({ character: actor, deltaMs: 50, navigation, now })
            if (
                actor.position.x !== before.x ||
                actor.position.y !== before.y
            ) {
                movementSamples += 1
            }
            resolvePendingAttackHit({
                actor,
                targets: actors,
                navigation,
                tileSize: 16,
                now,
                random: () => 0.9,
                respawnDelayMsFor: () => 1_000,
            })
        }
    }

    return {
        step,
        playerId,
        stop: () => room.stop(),
        counts: () => ({ attackStarts, movementSamples }),
        snapshot(frame: number, observer: number): WorldSnapshot {
            const hint: SetViewportClientMessage = {
                type: 'set_viewport',
                locationId: CENTER_LOCATION_ID,
                bounds: {
                    left: origin.x - 320 + observer,
                    right: origin.x + 320 + observer,
                    top: origin.y - 240,
                    bottom: origin.y + 240,
                },
            }
            const result = projectViewport(
                room.snapshot(now, CENTER_LOCATION_ID, playerId),
                hint,
                playerId
            )
            assert.equal(result.characters.length, actorCount)
            return { ...result, tick: frame, stepMs: 50 }
        },
    }
}

function requiredActor(room: GameRoom, playerId: string): GameCharacter {
    const actor = room.getCharacter(playerId)
    assert.ok(actor, 'Controlled actor must join through the ordinary command')
    return actor
}

function fixtureActors(hero: GameCharacter, count: number): GameCharacter[] {
    // A training target survives ordinary validated attacks without fabricated HP.
    return Array.from({ length: count }, (_, index) => {
        const target = index === 0
        const actor = new GameCharacter({
            id: `fixture-${String(index).padStart(2, '0')}`,
            nickname: `Benchmark actor ${index}`,
            archetype: 'human',
            controllerKind: 'scripted',
            faction: 'peaceful',
            spawnedAt: 1_000_000,
            spawnPosition: {
                x: hero.position.x + (target ? 0 : (index % 10) * 24 - 100),
                y:
                    hero.position.y +
                    (target ? 10 : Math.floor(index / 10) * 24 - 90),
            },
            ...(target
                ? { trainingTarget: { areaId: 'snapshot-benchmark' } }
                : {}),
        })
        actor.combat.readyAt = 1_040_000
        return actor
    })
}
