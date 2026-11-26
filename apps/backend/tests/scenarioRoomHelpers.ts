import type {
    ClientMessage,
    HeroClass,
    ScenarioDefinition,
    ServerMessage,
    Vector2,
} from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import type { GameRoomOptions } from '../src/ai/roomAi'
import type { GameCharacter } from '../src/game/character'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { createCityTestRoom } from './cityRoomFixture'

export function openScenarioRoom(ai?: GameRoomOptions['ai']) {
    return startScenarioRoom(
        () => new GameRoom(undefined, ai === undefined ? {} : { ai })
    )
}

export function openCityScenarioRoom(ai?: GameRoomOptions['ai']) {
    return startScenarioRoom(() =>
        createCityTestRoom(undefined, ai === undefined ? {} : { ai })
    )
}

function startScenarioRoom(createRoom: () => GameRoom) {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const room = createRoom()
    room.start()
    return room
}

export function openCompanionScenarioRoom(
    scope: 'region' | 'city' = 'region'
): GameRoom {
    const openRoom = scope === 'city' ? openCityScenarioRoom : openScenarioRoom
    return openRoom({
        config: parseNpcAiConfig(
            {
                proactive: false,
                npcs: [{ actorId: 'npc_veteran_1', role: 'companion' }],
            },
            true
        ),
        provider: {
            decide: (context) =>
                Promise.resolve({
                    decision: null,
                    taskAcceptance:
                        context.commandCapabilities?.orders.follow?.allowed ===
                        true
                            ? 'accept'
                            : 'decline',
                    companionOrder:
                        context.commandCapabilities?.orders.follow?.allowed ===
                        true
                            ? 'follow'
                            : null,
                    speech: 'Согласен идти вместе.',
                    memory: '',
                    done: true,
                    waitMs: 0,
                }),
        },
    })
}

export async function enlistScenarioCompanion(
    room: GameRoom,
    owner: ReturnType<typeof joinScenarioRoom>
): Promise<GameCharacter> {
    const helper = room.getCharacter('npc_veteran_1')
    if (helper === undefined) {
        throw new Error('Missing veteran')
    }
    // Start the scenario fixture in conversation reach; the order still goes through the socket.
    owner.actor.position = { ...helper.position }
    owner.send({
        type: 'companion_request',
        request: 'follow',
        targetId: helper.id,
    })
    await vi.advanceTimersByTimeAsync(250)
    if (helper.soul.companion?.leaderId !== owner.actor.id) {
        throw new Error('The scenario fixture did not obtain modeled consent')
    }
    return helper
}

export function joinScenarioRoom(
    room: GameRoom,
    nickname: string,
    heroClass?: HeroClass
) {
    const sent: ServerMessage[] = []
    const socket = {
        send: (payload: string) =>
            sent.push(JSON.parse(payload) as ServerMessage),
    } as unknown as RoomSocket
    const send = (command: ClientMessage) =>
        room.handleMessage(socket, JSON.stringify(command))
    room.handleOpen(socket)
    send({
        type: 'join',
        nickname,
        ...(heroClass === undefined ? {} : { heroClass }),
    })
    const init = sent.find((message) => message.type === 'world_init')
    const actor = room.getCharacter(init?.playerId ?? '')
    if (actor === undefined) {
        throw new Error('Join did not create a living identity')
    }
    return {
        actor,
        socket,
        send,
        sent,
        view: () => {
            const automation = room.snapshot(
                Date.now(),
                actor.locationId,
                actor.id
            ).automation
            if (automation === undefined) {
                throw new Error('Missing private automation view')
            }
            return automation
        },
        save(scenario: ScenarioDefinition) {
            send({ type: 'scenario_save', scenario })
        },
    }
}

export function savedScenarioMarker(
    session: ReturnType<typeof joinScenarioRoom>,
    index = 0
) {
    const marker = session.view().markers[index]
    if (marker === undefined) {
        throw new Error('Marker creation was not accepted')
    }
    return marker
}

export function waitForScenario(
    predicate: () => boolean,
    timeoutMs = 15_000
): void {
    for (let elapsed = 0; elapsed < timeoutMs && !predicate(); elapsed += 50) {
        vi.advanceTimersByTime(50)
    }
    if (!predicate()) {
        throw new Error(
            `Scenario condition did not resolve within ${String(timeoutMs)}ms`
        )
    }
}

export function walkToScenarioPoint(
    session: ReturnType<typeof joinScenarioRoom>,
    point: Vector2
): void {
    session.send({ type: 'move_to', target: point })
    waitForScenario(
        () =>
            Math.hypot(
                session.actor.position.x - point.x,
                session.actor.position.y - point.y
            ) <= 4
    )
}

export function nearbyScenarioPoint(
    room: GameRoom,
    actor: GameCharacter
): Vector2 {
    const nav = room.navigationFor(actor),
        origin = nav.worldToTile(actor.position)
    for (const offset of [
        { x: 6, y: 0 },
        { x: 0, y: 6 },
        { x: -6, y: 0 },
        { x: 0, y: -6 },
    ]) {
        const point = nav.tileToWorld({
            x: origin.x + offset.x,
            y: origin.y + offset.y,
        })
        if (
            nav.findPathWorld(actor.position, point).length > 0 &&
            nav.hasLineOfSight(actor.position, point)
        ) {
            return point
        }
    }
    throw new Error('No nearby reachable scenario waypoint')
}

export function approachScenarioNpc(
    room: GameRoom,
    session: ReturnType<typeof joinScenarioRoom>,
    id: string
): GameCharacter {
    const npc = room.getCharacter(id)
    if (npc === undefined) {
        throw new Error('Missing scenario NPC')
    }
    const nav = room.navigationFor(session.actor)
    for (let elapsed = 0; elapsed < 20_000; elapsed += 250) {
        if (
            Math.hypot(
                session.actor.position.x - npc.position.x,
                session.actor.position.y - npc.position.y
            ) <= 40 &&
            nav.hasLineOfSight(session.actor.position, npc.position)
        ) {
            return npc
        }
        session.send({ type: 'move_to', target: { ...npc.position } })
        vi.advanceTimersByTime(250)
    }
    throw new Error('Could not approach the NPC using ordinary movement')
}

export function roomScenario(
    id: string,
    main: ScenarioDefinition['main'],
    repeat: number | null = 1
): ScenarioDefinition {
    return { id, name: id, main, repeat, sequences: [], reactions: [] }
}
