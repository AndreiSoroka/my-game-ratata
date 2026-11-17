import type { ClientMessage } from '@my-game-ratata/contracts'
import type { AutomationCommand } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { CompanionService } from './companions'
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
    companions: CompanionService
    world: WorldLocations
    connections: Map<RoomSocket, string | undefined>
}
export function handleCharacterMessage(
    context: ClientContext,
    player: GameCharacter,
    message: ClientMessage
): void {
    const { room, characters, world, connections } = context
    if (room.social.handle(player, message, Date.now())) {
        return
    }
    if (room.social.exchanges.isPaused(player.id)) {
        return
    }
    if (handleAutomation(player, message, room)) {
        return
    }
    if (manualScenarioOverride(message)) {
        room.scenarios.pause(player)
    }
    if (handleRoomControl(player, message, room, Date.now())) {
        return
    }
    if (message.type === 'companion_request' && message.request !== 'talk') {
        room.notifyNpcAi(player, message, [], Date.now())
    }
    const events = roomCharacterAction(context, player, message)
    if (events !== undefined) {
        if (
            message.type === 'interact' &&
            events.some(
                (event) => event.kind === 'chat' && event.targetId === player.id
            )
        ) {
            room.social.quests.inspect(
                player.id,
                message.targetId,
                `inspect:${player.id}:${String(Date.now())}`
            )
        }
        room.publishEvents(events)
        room.notifyNpcAi(player, message, events, Date.now())
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
        navigation: room.navigationFor(player),
        player,
        onRouteStart: () => room.scenarios.pause(player),
        requestAttack: (actor, targetId, target) => {
            room.requestAttack(actor, Date.now(), targetId, target)
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
    room: GameRoom
): boolean {
    if (!isAutomationCommand(message.type)) {
        return false
    }
    const result = room.requestAutomation(
        player,
        message as AutomationCommand,
        Date.now()
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
    message: ClientMessage
) {
    const { room, adventure, theft, characters, parties, companions, world } =
        context
    return handleRoomAction({
        graves: room.abilityContextFor(player, Date.now()).graves,
        requestAbilityAttack: room.abilityContextFor(player, Date.now())
            .requestAbilityAttack,
        adventure,
        theft,
        allCharacters: characters.values(),
        parties,
        characters: [
            ...charactersInLocation(characters, player.locationId).values(),
        ],
        companions,
        inventory: world.get(player.locationId).inventory,
        message,
        navigation: room.navigationFor(player),
        now: Date.now(),
        player,
    })
}
