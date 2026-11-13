import type { ServerMessage, Vector2 } from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { WorldInventory } from '../src/game/worldInventory'

export const chestId = 'chest_forest_1'
export const chestPosition = { x: 104, y: 72 }
export const now = 10_000

export function chestFixture() {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const navigation = chestNavigation()
    const inventory = new WorldInventory(navigation)
    const actor = chestHero('hero')
    return { actor, inventory, navigation }
}

export function chestNavigation(id = CENTER_LOCATION_ID) {
    return new NavigationService({
        id,
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
}

export function chestHero(id: string, position: Vector2 = { x: 88, y: 72 }) {
    return new GameCharacter({
        id,
        archetype: 'human',
        controllerKind: 'network_player',
        nickname: id,
        spawnPosition: position,
        faction: 'peaceful',
    })
}

export function joinChestRoom(room: GameRoom, nickname: string) {
    const sent: ServerMessage[] = []
    const socket = {
        send(payload: string) {
            sent.push(JSON.parse(payload) as ServerMessage)
        },
    } as RoomSocket
    room.handleOpen(socket)
    room.handleMessage(socket, JSON.stringify({ type: 'join', nickname }))
    const init = sent.find((message) => message.type === 'world_init')
    if (init === undefined) {
        throw new Error('Join did not initialize world')
    }
    const actor = room.getCharacter(init.playerId)
    if (actor === undefined) {
        throw new Error('Joined actor missing')
    }
    actor.position = { x: 88, y: 72 }
    return { actor, sent, socket }
}
