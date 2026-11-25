import type { JoinClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { EchoController } from './echoController'
import type { GameRoom } from './room'
import { type JoinContext, joinRoom, leaveRoom } from './roomIdentity'
import type { RoomSocket } from './roomMessaging'
import { createRoomPlayerFactory } from './roomPlayer'
import type { WorldLocations } from './worldLocations'

interface PlayerConnections extends Pick<
    JoinContext,
    | 'characters'
    | 'connections'
    | 'controllers'
    | 'nicknames'
    | 'tickMs'
    | 'onAttached'
    | 'closeConversations'
> {
    room: GameRoom
    world: () => WorldLocations
}

export function createRoomPlayerConnections(context: PlayerConnections) {
    const { room, world, characters, connections, controllers, nicknames } =
        context
    const now = room.gameplayNow
    const closeChestViews = (id: string) => world().closeChestViews(id)
    const onDetached = (actor: GameCharacter, at: number): void => {
        controllers.set(
            actor.id,
            new EchoController(actor, at, room.scenarios.running(actor.id))
        )
    }
    const identity: JoinContext = {
        ...context,
        resumeTokens: new WeakMap(),
        createPlayer: createRoomPlayerFactory(
            characters,
            nicknames,
            () => room.navigation,
            () => room.refreshPrayerAuraEnvironment(),
            now
        ),
        mapFor: (actor) => room.navigationFor(actor).summary,
        snapshotFor: (actor) =>
            room.snapshot(now(), actor.locationId, actor.id),
        onJoined: (socket, locale) =>
            room.speechTranslations.joined(socket, locale),
        now,
        clockResumeRevision: room.clockResumeRevision,
        closeChestViews,
        onDetached,
    }
    return {
        join(ws: RoomSocket, message: JoinClientMessage): void {
            joinRoom(identity, ws, message)
        },
        leave(ws: RoomSocket): void {
            leaveRoom(
                connections,
                characters,
                ws,
                closeChestViews,
                context.closeConversations,
                now(),
                onDetached
            )
        },
    }
}
