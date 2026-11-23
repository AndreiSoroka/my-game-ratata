import type { WorldChestSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { chestHasLineOfSight, type WorldChest } from './chestInteraction'
import type { NavigationService } from './navigation'
import type { WorldDeathLoot } from './worldDeathLoot'

export function snapshotWorldContainers(
    chests: ReadonlyMap<string, WorldChest>,
    deathLoot: WorldDeathLoot,
    navigation: NavigationService,
    now: number,
    observer?: GameCharacter
): WorldChestSnapshot[] {
    const accessibleRemains = new Map<string, WorldChest>()
    if (observer?.abilities.known.has('ash_raise') === true) {
        for (const remains of deathLoot.raisableCorpses(now)) {
            if (
                chestHasLineOfSight(
                    observer.position,
                    remains.position,
                    navigation,
                    112,
                    remains.bounds
                )
            ) {
                accessibleRemains.set(remains.id, remains)
            }
        }
    }
    const projectedChests = new Map([...chests, ...accessibleRemains])
    return [...projectedChests.values()].map((chest) => ({
        ...(chest.kind !== undefined
            ? { kind: chest.kind, title: chest.title, corpse: chest.corpse }
            : {}),
        ...(chest.propId === undefined ? {} : { propId: chest.propId }),
        ...(chest.bounds === undefined ? {} : { bounds: { ...chest.bounds } }),
        ...(accessibleRemains.has(chest.id) ? { raisable: true as const } : {}),
        ...(!chests.has(chest.id) ? { ashOnly: true as const } : {}),
        id: chest.id,
        itemCount: chest.contents.length,
        position: chest.position,
        state: chest.opened ? 'open' : 'closed',
    }))
}
