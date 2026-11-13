import {
    CONTRACT_PROTOCOL_VERSION,
    type HeroClass,
    type MapSummary,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type CharacterController,
    NetworkPlayerController,
} from './controllers'
import { normalizeNickname } from './identity'
import { cancelMovementMode } from './movementActions'
import {
    broadcastEvent,
    type RoomSocket,
    send,
    sendError,
} from './roomMessaging'

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
    tickMs: number
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
    if (existingId !== undefined) {
        context.closeChestViews?.(existingId)
        const existingCharacter = context.characters.get(existingId)
        stopCharacterMovement(existingCharacter)
    }
    const existingCharacter =
        existingPlayerId === undefined
            ? undefined
            : context.characters.get(existingPlayerId)
    const character =
        existingCharacter ??
        context.createPlayer(nickname, nicknameKey, archetype, heroClass)
    character.tags.delete('offline')
    stopCharacterMovement(character)
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
    character: GameCharacter | undefined
): void {
    if (character === undefined) {
        return
    }
    cancelMovementMode(character)
    character.setMoveInput({ x: 0, y: 0 })
    character.clearPath()
}

export function leaveRoom(
    connections: Map<RoomSocket, string | undefined>,
    characters: ReadonlyMap<string, GameCharacter>,
    socket: RoomSocket,
    closeChestViews: (actorId: string) => void
): void {
    const playerId = connections.get(socket)
    connections.delete(socket)
    if (playerId === undefined) {
        return
    }
    closeChestViews(playerId)
    const player = characters.get(playerId)
    stopCharacterMovement(player)
    player?.tags.add('offline')
    broadcastEvent(connections.keys(), { actorId: playerId, kind: 'leave' })
}
