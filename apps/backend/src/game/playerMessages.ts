import type { ClientMessage, GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { faceNearestTarget } from './queries'
import { broadcastChat, type RoomSocket } from './roomMessaging'
import type { WorldInventory } from './worldInventory'

interface PlayerMessageContext {
    characters: Map<string, GameCharacter>
    connections: Map<RoomSocket, string | undefined>
    message: ClientMessage
    navigation: NavigationService
    player: GameCharacter
    requestAttack: (actor: GameCharacter) => void
    sendEvents: (events: GameEventPayload[]) => void
    worldInventory: WorldInventory
}

export function applyPlayerMessage(context: PlayerMessageContext): void {
    const { message, player } = context

    if (message.type === 'move_input') {
        player.setMoveInput(message.axis)
        return
    }

    if (message.type === 'move_to') {
        player.setPath(
            context.navigation.findPathWorld(player.position, message.target)
        )
        return
    }

    if (message.type === 'attack') {
        faceNearestTarget(player, context.characters.values(), 48)
        context.requestAttack(player)
        return
    }

    if (message.type === 'pickup_item') {
        context.sendEvents(context.worldInventory.pickupNearestItem(player))
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

    if (message.type === 'chat') {
        broadcastChat(
            context.connections,
            context.characters,
            player,
            message.text
        )
    }
}
