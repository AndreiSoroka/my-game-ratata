import type {
    CharacterArchetype,
    ClientMessage,
    GameLocale,
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
import { setSocketViewport } from './roomViewport'

function dispatchRawRoomMessage(
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
        createOnly?: boolean,
        locale?: GameLocale
    ): void
    abandon(actor: GameCharacter): void
}
export function createRoomMessageHandler(
    context: () => DispatchContext,
    onDispatched: () => void
) {
    return (ws: RoomSocket, raw: unknown): void =>
        dispatchRawRoomMessage(ws, raw, (message) => {
            dispatchRoomClientMessage(context(), ws, message)
            onDispatched()
        })
}

function dispatchRoomClientMessage(
    context: DispatchContext,
    ws: RoomSocket,
    message: ClientMessage,
    now = context.room.gameplayNow()
): void {
    if (message.type === 'join') {
        context.join(
            ws,
            message.nickname,
            message.archetype ?? 'human',
            message.heroClass,
            message.createOnly,
            message.locale
        )
        return
    }
    const player = context.characters.get(context.connections.get(ws) ?? '')
    if (player === undefined) {
        sendError(ws, 'not_joined', 'Join the room before sending input')
        return
    }
    if (message.type === 'set_viewport') {
        setSocketViewport(ws, player.id, player.locationId, message)
        return
    }
    if (message.type === 'set_locale') {
        context.room.speechTranslations.setLocale(ws, message.locale)
        return
    }
    if (message.type === 'abandon_life') {
        context.abandon(player)
        return
    }
    if (message.type === 'use_portal') {
        context.room.publishEvents(
            context.room.requestPortalUse(player, message.endpointId, now)
        )
        return
    }
    if (message.type === 'plant_tree_preview') {
        const preview = plantingPreview(
            player,
            message,
            context.adventure,
            context.room.navigationFor(player),
            now
        )
        if (preview !== undefined) {
            send(ws, preview)
        }
        return
    }
    handleCharacterMessage(context, player, message, now)
}
