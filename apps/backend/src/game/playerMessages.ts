import type {
    ClientMessage,
    GameEventPayload,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { enqueueCharacterRoute } from './characterRoute'
import { isChestCommand } from './chestCommands'
import { cancelSniperAim, cancelSniperAimForMovement } from './combatArchery'
import { canWalkDuringPrayer } from './combatMovement'
import { cancelMagicChannel, cancelMagicForMovement } from './magicState'
import type { NavigationService } from './navigation'
import { cancelPrayerCast, cancelPrayerForMovement } from './prayerCancellation'
import { faceNearestTarget } from './queries'
import { broadcastChat, type RoomSocket } from './roomMessaging'
import { routeCommandFeedback } from './routeCommandFeedback'
import type { WorldInventory } from './worldInventory'

interface PlayerMessageContext {
    characters: Map<string, GameCharacter>
    connections: Map<RoomSocket, string | undefined>
    message: ClientMessage
    navigation: NavigationService
    player: GameCharacter
    onRouteStart?: () => void
    requestAttack: (
        actor: GameCharacter,
        targetId?: string,
        target?: WorldCombatTarget
    ) => void
    sendEvents: (events: GameEventPayload[]) => void
    worldInventory: WorldInventory
}

export function applyPlayerMessage(context: PlayerMessageContext): void {
    const { message, player } = context

    if (message.type === 'move_input') {
        applyMovementInput(context, message)
        return
    }

    if (message.type === 'move_to') {
        applyRouteMessage(context, message)
        return
    }

    if (message.type === 'attack') {
        cancelCharacterControl(player)
        if (message.targetId === undefined && message.target === undefined) {
            faceNearestTarget(
                player,
                context.characters.values(),
                48,
                context.navigation
            )
        }
        context.requestAttack(player, message.targetId, message.target)
        return
    }

    if (isChestCommand(message)) {
        context.sendEvents(
            context.worldInventory.containers.handle(player, message)
        )
        return
    }

    if (message.type === 'pickup_item') {
        context.sendEvents(
            context.worldInventory.pickupItem(player, message.worldItemId)
        )
        return
    }

    if (message.type === 'inventory_action') {
        context.sendEvents(
            context.worldInventory.applyInventoryAction(
                player,
                message.action,
                message.itemInstanceId
            )
        )
        return
    }

    if (message.type === 'equipment_action') {
        context.sendEvents(context.worldInventory.unequip(player, message.slot))
        return
    }

    if (message.type === 'chat' && player.soul.canSpeak) {
        broadcastChat(
            context.connections,
            context.characters,
            player,
            message.text,
            context.navigation
        )
    }
}

function applyRouteMessage(
    context: PlayerMessageContext,
    message: Extract<ClientMessage, { type: 'move_to' }>
): void {
    const { player, navigation, sendEvents } = context
    const now = Date.now()
    const events: GameEventPayload[] = []
    const result = enqueueCharacterRoute(
        player,
        message.target,
        message.append ?? false,
        navigation,
        now,
        () => {
            context.onRouteStart?.()
            cancelCharacterControl(player)
        }
    )
    if (result.accepted) {
        if (!canWalkDuringPrayer(player)) {
            events.push(...cancelPrayerCast(player, now))
        }
        events.push(
            ...cancelMagicChannel(player, now),
            ...cancelSniperAim(player, now)
        )
    }
    events.push(...routeCommandFeedback(player, result))
    if (events.length > 0) {
        sendEvents(events)
    }
}

function applyMovementInput(
    context: PlayerMessageContext,
    message: Extract<ClientMessage, { type: 'move_input' }>
): void {
    const { player } = context
    const now = Date.now()
    context.sendEvents([
        ...cancelPrayerForMovement(player, message.axis, now),
        ...cancelMagicForMovement(player, message.axis, now),
        ...cancelSniperAimForMovement(player, message.axis, now),
    ])
    if (message.axis.x !== 0 || message.axis.y !== 0) {
        cancelCharacterControl(player)
    }
    player.setMoveInput(message.axis)
}
