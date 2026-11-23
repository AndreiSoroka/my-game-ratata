import type {
    AutomationCommand,
    ClientMessage,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { PartyService } from './parties'
import { applyPlayerMessage } from './playerMessages'
import type { GameRoom } from './room'
import { handleRoomAction } from './roomActions'
import { handleRoomControl } from './roomControl'
import type { RoomSocket } from './roomMessaging'
import { charactersInLocation, connectionsInLocation } from './roomQueries'
import { isAutomationCommand } from './scenarioCommands'
import type { TheftService } from './theft'
import type { WorldLocations } from './worldLocations'
export interface ClientContext {
    room: GameRoom
    adventure: AdventureService
    theft: TheftService
    characters: Map<string, GameCharacter>
    parties: PartyService
    world: WorldLocations
    connections: Map<RoomSocket, string | undefined>
}
export function handleCharacterMessage(
    context: ClientContext,
    player: GameCharacter,
    message: ClientMessage,
    now = context.room.gameplayNow()
): void {
    const { room, characters, world, connections } = context
    if (room.social.handle(player, message, now)) {
        return
    }
    if (room.social.exchanges.isPaused(player.id)) {
        return
    }
    if (handleAutomation(player, message, room, now)) {
        return
    }
    if (manualScenarioOverride(message)) {
        room.scenarios.pause(player)
    }
    if (handleRoomControl(player, message, room, now)) {
        return
    }
    const events = roomCharacterAction(context, player, message, now)
    if (events !== undefined) {
        room.publishEvents(events)
        return
    }
    if (!player.alive) {
        return
    }
    applyPlayerMessage({
        characters: charactersInLocation(characters, player.locationId),
        connections: connectionsInLocation(
            connections,
            characters,
            player.locationId
        ),
        message,
        now,
        navigation: room.navigationFor(player),
        player,
        onRouteStart: () => room.scenarios.pause(player),
        requestAttack: (actor, targetId, target) => {
            room.requestAttack(actor, now, targetId, target)
        },
        sendEvents: (events) => {
            room.publishEvents(events)
        },
        worldInventory: world.get(player.locationId).inventory,
    })
}

function manualScenarioOverride(message: ClientMessage): boolean {
    if (message.type === 'move_input') {
        return message.axis.x !== 0 || message.axis.y !== 0
    }
    return [
        'cancel_control',
        'attack',
        'auto_action',
        'auto_attack',
        'follow',
        'dash',
        'interact',
        'pray',
        'revive',
        'cast_spell',
        'use_ability',
        'gather',
        'farm_action',
        'farm_supply',
        'plant_tree',
        'open_chest',
    ].includes(message.type)
}

function handleAutomation(
    player: GameCharacter,
    message: ClientMessage,
    room: GameRoom,
    now: number
): boolean {
    if (!isAutomationCommand(message.type)) {
        return false
    }
    const result = room.requestAutomation(
        player,
        message as AutomationCommand,
        now
    )
    if (result.error !== null) {
        room.publishEvents([
            {
                kind: 'notice',
                actorId: player.id,
                audienceIds: [player.id],
                text: result.error,
            },
        ])
    }
    return true
}

function roomCharacterAction(
    context: ClientContext,
    player: GameCharacter,
    message: ClientMessage,
    now: number
) {
    const { room, adventure, theft, characters, parties, world } = context
    const abilityContext = room.abilityContextFor(player, now)
    return handleRoomAction({
        ...abilityContext,
        adventure,
        theft,
        allCharacters: characters.values(),
        parties,
        characters: [
            ...charactersInLocation(characters, player.locationId).values(),
        ],
        inventory: world.get(player.locationId).inventory,
        message,
        player,
    })
}
