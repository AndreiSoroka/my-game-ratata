import type { GameEventPayload, ServerMessage } from '@my-game-ratata/contracts'
import type { ServerWebSocket } from 'bun'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { resolveChatText } from './chat'
import type { NavigationService } from './navigation'
import { createSpeechEvent } from './speechReceipts'

export interface RoomSocketData {
    socketId: string
}

export type RoomSocket = ServerWebSocket<RoomSocketData>

export function send(ws: RoomSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message))
}

export function sendError(ws: RoomSocket, code: string, message: string): void {
    send(ws, {
        code,
        message,
        type: 'error',
    })
}

export function broadcast(
    connections: Iterable<RoomSocket>,
    message: ServerMessage
): void {
    const payload = JSON.stringify(message)

    for (const ws of connections) {
        ws.send(payload)
    }
}

export function broadcastEvent(
    connections: Iterable<RoomSocket>,
    event: GameEventPayload,
    now = Date.now()
): void {
    broadcast(connections, {
        event,
        serverTime: now,
        type: 'event',
    })
}

export function broadcastChat(
    connections: Iterable<[RoomSocket, string | undefined]>,
    characters: ReadonlyMap<string, GameCharacter>,
    actor: GameCharacter,
    text: string,
    navigation?: NavigationService,
    now = Date.now()
): void {
    if (!actor.soul.canSpeak) {
        return
    }
    const speech = createSpeechEvent(actor, text)
    for (const [ws, playerId] of connections) {
        const observer =
            playerId === undefined ? undefined : characters.get(playerId)
        if (!canObserveRoomCharacter(observer, actor, navigation, now)) {
            continue
        }
        const visibleText = resolveChatText(actor, observer, text)

        send(ws, {
            event: {
                ...speech,
                text: visibleText,
            },
            serverTime: now,
            type: 'event',
        })
    }
}
