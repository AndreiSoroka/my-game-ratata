import {
    CONTRACT_PROTOCOL_VERSION,
    type GameEventPayload,
    type HeroClass,
    type MapSummary,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { setCharacterControlSource } from './characterSoul'
import {
    type CharacterController,
    NetworkPlayerController,
} from './controllers'
import { normalizeNickname } from './identity'
import { cancelMovementMode } from './movementActions'
import { prepareConstellationLayout } from './personalConstellationSky'
import { cancelPrayerCast } from './prayerCancellation'
import type { GameRoom } from './room'
import {
    broadcastEvent,
    type RoomSocket,
    send,
    sendError,
} from './roomMessaging'
import type { WorldLocations } from './worldLocations'

interface JoinContext {
    closeChestViews?: (actorId: string) => void
    characters: Map<string, GameCharacter>
    connections: Map<RoomSocket, string | undefined>
    controllers: Map<string, CharacterController>
    createPlayer: (
        nickname: string,
        nicknameKey: string,
        archetype: GameCharacter['archetype'],
        heroClass: HeroClass | undefined
    ) => GameCharacter
    mapFor: (character: GameCharacter) => MapSummary
    nicknames: Map<string, string>
    snapshotFor: (character: GameCharacter) => WorldSnapshot
    closeConversations?: (characterId: string) => void
    tickMs: number
}

export function createRoomJoiner(
    context: Omit<JoinContext, 'closeChestViews' | 'mapFor' | 'snapshotFor'> & {
        room: GameRoom
        world: () => WorldLocations
    }
) {
    return (
        ws: RoomSocket,
        nickname: string,
        archetype: GameCharacter['archetype'],
        heroClass?: HeroClass
    ): void =>
        joinRoom(
            {
                ...context,
                closeChestViews: (id) => context.world().closeChestViews(id),
                mapFor: (character) =>
                    context.room.navigationFor(character).summary,
                snapshotFor: (character) =>
                    context.room.snapshot(
                        Date.now(),
                        character.locationId,
                        character.id
                    ),
            },
            ws,
            nickname,
            archetype,
            heroClass
        )
}

export function joinRoom(
    context: JoinContext,
    ws: RoomSocket,
    nickname: string,
    archetype: GameCharacter['archetype'],
    heroClass: HeroClass | undefined
): void {
    const nicknameKey = normalizeNickname(nickname)
    const existingPlayerId = context.nicknames.get(nicknameKey)
    if (
        existingPlayerId !== undefined &&
        isPlayerConnected(context.connections, existingPlayerId, ws)
    ) {
        sendError(ws, 'name_taken', 'Nickname is already in use')
        return
    }
    const existingId = context.connections.get(ws)
    if (
        existingId !== undefined &&
        !isPlayerConnected(context.connections, existingId, ws)
    ) {
        context.closeChestViews?.(existingId)
        context.closeConversations?.(existingId)
        const existingCharacter = context.characters.get(existingId)
        stopAndPublish(existingCharacter, context.connections.keys())
        if (
            existingCharacter !== undefined &&
            existingId !== existingPlayerId
        ) {
            existingCharacter.connected = false
            setCharacterControlSource(existingCharacter, 'script')
        }
    }
    const existingCharacter =
        existingPlayerId === undefined
            ? undefined
            : context.characters.get(existingPlayerId)
    const character =
        existingCharacter ??
        context.createPlayer(nickname, nicknameKey, archetype, heroClass)
    prepareConstellationLayout(character)
    character.tags.delete('offline')
    character.connected = true
    setCharacterControlSource(character, 'human')
    stopAndPublish(character, context.connections.keys())
    context.controllers.set(character.id, new NetworkPlayerController())
    context.connections.set(ws, character.id)
    send(ws, {
        map: context.mapFor(character),
        playerId: character.id,
        protocolVersion: CONTRACT_PROTOCOL_VERSION,
        snapshot: context.snapshotFor(character),
        tickMs: context.tickMs,
        type: 'world_init',
    })
    broadcastEvent(context.connections.keys(), {
        actorId: character.id,
        kind: 'join',
    })
}

function isPlayerConnected(
    connections: Map<RoomSocket, string | undefined>,
    playerId: string,
    exceptWs: RoomSocket
): boolean {
    for (const [connection, connectedPlayerId] of connections) {
        if (connection !== exceptWs && connectedPlayerId === playerId) {
            return true
        }
    }
    return false
}

export function stopCharacterMovement(
    character: GameCharacter | undefined,
    now = Date.now()
): GameEventPayload[] {
    if (character === undefined) {
        return []
    }
    cancelCharacterControl(character)
    cancelMovementMode(character)
    character.setMoveInput({ x: 0, y: 0 })
    character.clearPath()
    return cancelPrayerCast(character, now)
}

export function leaveRoom(
    connections: Map<RoomSocket, string | undefined>,
    characters: ReadonlyMap<string, GameCharacter>,
    socket: RoomSocket,
    closeChestViews: (actorId: string) => void,
    closeConversations?: (characterId: string) => void
): void {
    const playerId = connections.get(socket)
    connections.delete(socket)
    if (
        playerId === undefined ||
        isPlayerConnected(connections, playerId, socket)
    ) {
        return
    }
    closeChestViews(playerId)
    closeConversations?.(playerId)
    const player = characters.get(playerId)
    stopAndPublish(player, connections.keys())
    if (player !== undefined) {
        player.connected = false
        setCharacterControlSource(player, 'script')
    }
    broadcastEvent(connections.keys(), { actorId: playerId, kind: 'leave' })
}

function stopAndPublish(
    character: GameCharacter | undefined,
    sockets: Iterable<RoomSocket>
): void {
    for (const event of stopCharacterMovement(character)) {
        broadcastEvent(sockets, event)
    }
}
