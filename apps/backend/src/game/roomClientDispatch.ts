import type {
    CharacterArchetype,
    ClientMessage,
    HeroClass,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { plantingPreview } from './plantingPreview'
import {
    type ClientContext,
    handleCharacterMessage,
} from './roomClientMessages'
import { type RoomSocket, send, sendError } from './roomMessaging'

interface DispatchContext extends ClientContext {
    join(
        ws: RoomSocket,
        nickname: string,
        archetype: CharacterArchetype,
        heroClass: HeroClass | undefined
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
            message.heroClass
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
