import type {
    CharacterArchetype,
    ClientMessage,
    HeroClass,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { parseSocketMessage } from './messages'
import { plantingPreview } from './plantingPreview'
import {
    type ClientContext,
    handleCharacterMessage,
} from './roomClientMessages'
import { type RoomSocket, send, sendError } from './roomMessaging'

export function dispatchRawRoomMessage(
    ws: RoomSocket,
    raw: unknown,
    dispatch: (message: ClientMessage) => void
): void {
    const result = parseSocketMessage(raw)
    if (result.message === undefined) {
        sendError(ws, 'invalid_message', result.error ?? 'Invalid message')
        return
    }
    dispatch(result.message)
}

interface DispatchContext extends ClientContext {
    join(
        ws: RoomSocket,
        nickname: string,
        archetype: CharacterArchetype,
        heroClass: HeroClass | undefined,
        createOnly?: boolean
    ): void
    abandon(actor: GameCharacter): void
}
export function dispatchRoomClientMessage(
    context: DispatchContext,
    ws: RoomSocket,
    message: ClientMessage
): void {
    if (message.type === 'join') {
        context.join(
            ws,
            message.nickname,
            message.archetype ?? 'human',
            message.heroClass,
            message.createOnly
        )
        return
    }
    const player = context.characters.get(context.connections.get(ws) ?? '')
    if (player === undefined) {
        sendError(ws, 'not_joined', 'Join the room before sending input')
        return
    }
    if (message.type === 'abandon_life') {
        context.abandon(player)
        return
    }
    if (message.type === 'plant_tree_preview') {
        const preview = plantingPreview(
            player,
            message,
            context.adventure,
            context.room.navigationFor(player),
            Date.now()
        )
        if (preview !== undefined) {
            send(ws, preview)
        }
        return
    }
    handleCharacterMessage(context, player, message)
}
