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
import {
    requestSnapshotResync,
    type RoomSocket,
    send,
    sendError,
} from './roomMessaging'
import { setSocketViewport } from './roomViewport'
import {
    beginManualStopEpisode,
    hasMovementAxis,
    hasPendingManualStop,
    invalidateManualStop,
    replayStopCorrection,
    requestManualStop,
} from './stopCorrection'

function dispatchRawRoomMessage(
    ws: RoomSocket,
    raw: unknown,
    dispatch: (
        message: ClientMessage,
        invalidStopCorrectionId: number | undefined
    ) => void
): void {
    const result = parseSocketMessage(raw)
    if (result.message === undefined) {
        sendError(ws, 'invalid_message', result.error ?? 'Invalid message')
        return
    }
    dispatch(result.message, result.invalidStopCorrectionId)
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
        dispatchRawRoomMessage(ws, raw, (message, invalidStopCorrectionId) => {
            dispatchRoomClientMessage(
                context(),
                ws,
                message,
                invalidStopCorrectionId
            )
            onDispatched()
        })
}

function dispatchRoomClientMessage(
    context: DispatchContext,
    ws: RoomSocket,
    message: ClientMessage,
    invalidStopCorrectionId: number | undefined,
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
    if (handleSnapshotControl(ws, player, message, now)) {
        return
    }
    if (message.type === 'set_locale') {
        context.room.speechTranslations.setLocale(ws, message.locale)
        return
    }
    if (message.type === 'move_input') {
        dispatchMovementInput(
            context,
            ws,
            player,
            message,
            invalidStopCorrectionId,
            now
        )
        return
    }
    dispatchCharacterCommand(context, ws, player, message, now)
}

function dispatchCharacterCommand(
    context: DispatchContext,
    ws: RoomSocket,
    player: GameCharacter,
    message: ClientMessage,
    now: number
): void {
    if (
        ![
            'chat',
            'speech_activity',
            'plant_tree_preview',
            'cancel_control',
            'movement_mode',
        ].includes(message.type)
    ) {
        invalidateManualStop(player)
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

function handleSnapshotControl(
    ws: RoomSocket,
    player: GameCharacter,
    message: ClientMessage,
    now: number
): boolean {
    if (message.type === 'set_viewport') {
        setSocketViewport(ws, player.id, player.locationId, message)
        return true
    }
    if (message.type === 'snapshot_resync') {
        requestSnapshotResync(ws, now)
        invalidateManualStop(player)
        return true
    }
    return false
}

function dispatchMovementInput(
    context: ClientContext,
    socket: RoomSocket,
    actor: GameCharacter,
    message: Extract<ClientMessage, { type: 'move_input' }>,
    invalidId: number | undefined,
    now: number
): void {
    if (hasMovementAxis(message.axis)) {
        if (hasPendingManualStop(actor)) {
            invalidateManualStop(actor)
        }
        handleCharacterMessage(context, actor, message, now)
        if (
            hasMovementAxis(actor.getMoveInput()) &&
            !context.room.social.exchanges.isPaused(actor.id)
        ) {
            beginManualStopEpisode(socket, actor)
        }
        return
    }
    const id = message.stopCorrection?.id ?? invalidId
    if (id !== undefined && replayStopCorrection(socket, actor, id)) {
        return
    }
    const wasMoving = hasMovementAxis(actor.getMoveInput())
    handleCharacterMessage(context, actor, message, now)
    requestManualStop(
        socket,
        actor,
        wasMoving,
        message.stopCorrection,
        invalidId,
        now
    )
}
