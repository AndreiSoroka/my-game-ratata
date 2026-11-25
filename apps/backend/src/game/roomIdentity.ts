import {
    type GameEventPayload,
    type GameLocale,
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
import { cancelMagicChannel } from './magicState'
import { cancelMovementMode } from './movementActions'
import { prepareConstellationLayout } from './personalConstellationSky'
import { cancelPrayerCast } from './prayerCancellation'
import {
    broadcastEvent,
    clearSnapshotStream,
    type RoomSocket,
    sendError,
} from './roomMessaging'
import { sendInitialRoomState } from './roomSnapshotPublication'
import { clearSocketViewport } from './roomViewport'
import { closeSnapshotSocket } from './snapshotStream'

export interface JoinContext {
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
    onJoined?: (socket: RoomSocket, locale: GameLocale) => void
    onAttached?: () => void
    onDetached?: (character: GameCharacter, now: number) => void
    now?: () => number
    tickMs: number
    clockResumeRevision?: () => number
}

export function joinRoom(
    context: JoinContext,
    ws: RoomSocket,
    nickname: string,
    archetype: GameCharacter['archetype'],
    heroClass: HeroClass | undefined,
    createOnly?: boolean,
    locale: GameLocale = 'ru'
): void {
    const now = context.now ?? Date.now
    clearSocketViewport(ws)
    const nicknameKey = normalizeNickname(nickname)
    if (createOnlyNameTaken(context.characters, nicknameKey, createOnly)) {
        sendError(
            ws,
            'name_taken',
            'Это имя уже занято. Сгенерируйте другое или введите своё'
        )
        return
    }
    const existingPlayerId = context.nicknames.get(nicknameKey)
    if (
        existingPlayerId !== undefined &&
        isPlayerConnected(context.connections, existingPlayerId, ws)
    ) {
        sendError(
            ws,
            'name_taken',
            'Это имя уже занято. Сгенерируйте другое или введите своё'
        )
        return
    }
    detachPreviousHero(context, ws, existingPlayerId, now())
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
    stopAndPublish(character, context.connections.keys(), now())
    context.controllers.set(character.id, new NetworkPlayerController())
    context.connections.set(ws, character.id)
    context.onJoined?.(ws, locale)
    context.onAttached?.()
    if (!initializeJoinedPlayer(context, ws, character, now)) {
        return
    }
    broadcastEvent(
        context.connections.keys(),
        {
            actorId: character.id,
            kind: 'join',
        },
        now()
    )
}

function detachPreviousHero(
    context: JoinContext,
    ws: RoomSocket,
    existingPlayerId: string | undefined,
    now: number
): void {
    const existingId = context.connections.get(ws)
    if (
        existingId !== undefined &&
        !isPlayerConnected(context.connections, existingId, ws)
    ) {
        context.closeChestViews?.(existingId)
        context.closeConversations?.(existingId)
        const existingCharacter = context.characters.get(existingId)
        stopAndPublish(existingCharacter, context.connections.keys(), now)
        if (
            existingCharacter !== undefined &&
            existingId !== existingPlayerId
        ) {
            markDetached(existingCharacter, now, context.onDetached)
        }
    }
}

function createOnlyNameTaken(
    characters: ReadonlyMap<string, GameCharacter>,
    nicknameKey: string,
    createOnly: boolean | undefined
): boolean {
    return (
        createOnly === true &&
        [...characters.values()].some(
            (character) => normalizeNickname(character.nickname) === nicknameKey
        )
    )
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
    return [
        ...cancelPrayerCast(character, now),
        ...cancelMagicChannel(character, now),
    ]
}

export function leaveRoom(
    connections: Map<RoomSocket, string | undefined>,
    characters: ReadonlyMap<string, GameCharacter>,
    socket: RoomSocket,
    closeChestViews: (actorId: string) => void,
    closeConversations?: (characterId: string) => void,
    now = Date.now(),
    onDetached?: JoinContext['onDetached']
): void {
    clearSocketViewport(socket)
    clearSnapshotStream(socket)
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
    stopAndPublish(player, connections.keys(), now)
    if (player !== undefined) {
        markDetached(player, now, onDetached)
    }
    broadcastEvent(
        connections.keys(),
        { actorId: playerId, kind: 'leave' },
        now
    )
}

function markDetached(
    character: GameCharacter,
    now: number,
    onDetached: JoinContext['onDetached']
): void {
    character.connected = false
    setCharacterControlSource(character, 'script')
    onDetached?.(character, now)
}

function stopAndPublish(
    character: GameCharacter | undefined,
    sockets: Iterable<RoomSocket>,
    now: number
): void {
    for (const event of stopCharacterMovement(character, now)) {
        broadcastEvent(sockets, event, now)
    }
}

function initializeJoinedPlayer(
    context: JoinContext,
    ws: RoomSocket,
    character: GameCharacter,
    now: () => number
): boolean {
    const initialized = sendInitialRoomState(context, ws, character)
    if (!initialized) {
        leaveRoom(
            context.connections,
            context.characters,
            ws,
            (id) => context.closeChestViews?.(id),
            context.closeConversations,
            now(),
            context.onDetached
        )
        closeSnapshotSocket(ws)
        return false
    }
    return true
}
