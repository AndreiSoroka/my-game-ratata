import type { GameEventPayload } from '@my-game-ratata/contracts'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { WorldInventory } from '../src/game/worldInventory'
import { chestHero, chestNavigation } from './chestTestHelpers'

export function heartFixture(
    controllerKind: GameCharacter['controllerKind'] = 'network_player'
) {
    const clock = { now: 10_000 }
    const actor = new GameCharacter({
        id: 'hero',
        archetype: 'human',
        controllerKind,
        faction: 'peaceful',
        nickname: 'Hero',
        spawnPosition: { x: 100, y: 100 },
    })
    const mira = new GameCharacter({
        id: 'npc_friendly_girl_1',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        nickname: 'Mira',
        spawnPosition: { x: 100, y: 100 },
    })
    const navigation = chestNavigation()
    const inventory = new WorldInventory(navigation)
    const service = new AdventureService({ now: () => clock.now })
    const find = (id: string, target?: GameCharacter) =>
        [actor, mira, target].find((character) => character?.id === id)
    const kill = (id: string) => {
        const target = slime(id)
        target.applyDamage(target.hp, clock.now)
        target.queueRespawn(clock.now, 15_000)
        const events: GameEventPayload[] = [
            { kind: 'death', actorId: actor.id, targetId: target.id },
        ]
        const loot = inventory.dropLootForDeaths(events, (key) =>
            find(key, target)
        )
        service.observe(events, (key) => find(key, target))
        return { target, events, loot }
    }
    const collect = () => {
        for (const item of inventory.snapshotItems()) {
            actor.position = { ...item.position }
            inventory.pickupItem(actor, item.id, clock.now)
        }
    }
    return {
        actor,
        mira,
        service,
        inventory,
        navigation,
        clock,
        kill,
        collect,
        accept: () => {
            service.interact(actor, mira.id, [mira])
            service.choose(actor, 'accept_quest', [mira])
        },
        snapshot: () => service.snapshot(actor.id, actor.locationId, actor),
        bring: (count = 3) => {
            for (let index = 0; index < count; index += 1) {
                kill(`slime-${String(index)}`)
                collect()
            }
        },
    }
}

export function slime(
    id = 'slime',
    controllerKind: GameCharacter['controllerKind'] = 'mob1'
) {
    return new GameCharacter({
        id,
        archetype: 'slime',
        controllerKind,
        faction: 'monsters',
        nickname: id,
        spawnPosition: { x: 112, y: 100 },
    })
}

export function heartOtherHero() {
    return chestHero('other', { x: 100, y: 100 })
}
