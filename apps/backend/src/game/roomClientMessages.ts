import type { ClientMessage } from '@my-game-ratata/contracts'

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
import type { TheftService } from './theft'
import type { WorldLocations } from './worldLocations'
interface ClientContext {
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
    const {
        room,
        adventure,
        theft,
        characters,
        parties,
        companions,
        world,
        connections,
    } = context
    if (handleRoomControl(player, message, room, Date.now())) {
        return
    }
    const events = handleRoomAction({
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
        navigation: room.navigationFor(player),
        player,
        requestAttack: (actor, targetId) => {
            room.requestAttack(actor, Date.now(), targetId)
        },
        sendEvents: (events) => {
            room.publishEvents(events)
        },
        worldInventory: world.get(player.locationId).inventory,
    })
}
