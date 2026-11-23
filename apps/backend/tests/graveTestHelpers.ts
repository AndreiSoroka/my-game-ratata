import type { GameEventPayload } from '@my-game-ratata/contracts'

import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import type { CharacterController } from '../src/game/controllers'
import { GraveSpawns } from '../src/game/graveSpawns'
import { normalizeNickname } from '../src/game/identity'
import { NavigationService } from '../src/game/navigation'
import { RoomLife } from '../src/game/roomLife'
import type { RoomSocket } from '../src/game/roomMessaging'
import type { SpawnedCharacter } from '../src/game/spawns'
import { WorldLocations } from '../src/game/worldLocations'

export function graveNavigation(id = 'grave-test') {
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

export function graveHero(
    id = 'fallen',
    locationId = 'map-3-2',
    nickname = id
) {
    return new GameCharacter({
        id,
        nickname,
        locationId,
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 168, y: 168 },
    })
}

export function graveFixture() {
    const service = new GraveSpawns()
    const navigation = graveNavigation()
    const characters = new Map<string, GameCharacter>()
    const created: SpawnedCharacter[] = []
    const context = {
        characters,
        navigation: () => navigation,
        occupants: () => [],
        add: (spawn: SpawnedCharacter) => {
            created.push(spawn)
            characters.set(spawn.character.id, spawn.character)
        },
        remove: (id: string) => {
            characters.delete(id)
        },
    }
    return { service, navigation, characters, created, context }
}

export function roomLifeFixture(nickname = 'fallen') {
    const hero = graveHero('fallen', 'map-3-2', nickname)
    const characters = new Map([[hero.id, hero]])
    const socket = { send: () => undefined } as unknown as RoomSocket
    const connections = new Map<RoomSocket, string | undefined>([
        [socket, hero.id],
    ])
    const controllers = new Map<string, CharacterController>()
    const nicknames = new Map([[normalizeNickname(hero.nickname), hero.id]])
    const gold = new Map([[hero.id, 37]])
    const world = new WorldLocations(graveNavigation(), {
        drainGold(id) {
            const amount = gold.get(id) ?? 0
            gold.set(id, 0)
            return amount
        },
        creditLootGold(id, amount) {
            gold.set(id, (gold.get(id) ?? 0) + amount)
            return true
        },
    })
    const events: GameEventPayload[] = []
    const life = new RoomLife(
        characters,
        connections,
        controllers,
        nicknames,
        () => world,
        new CompanionService(),
        (outcomes) => events.push(...outcomes)
    )
    const context = (actor: GameCharacter, now: number) => ({
        characters: [...characters.values()],
        navigation: world.get(actor.locationId).navigation,
        now,
        random: () => 0,
    })
    const advance = (now: number) => {
        life.advance(now, context)
    }
    return {
        hero,
        characters,
        socket,
        connections,
        controllers,
        nicknames,
        gold,
        world,
        events,
        life,
        context,
        advance,
    }
}
