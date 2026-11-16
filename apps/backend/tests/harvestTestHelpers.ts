import { type AdventureResourceNode } from '@my-game-ratata/contracts'

import { AdventureResources } from '../src/game/adventureResources'
import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'

export function weapon(actor: GameCharacter) {
    const item = actor.equipment.weapon
    if (item === undefined) {
        throw new Error('Missing tool')
    }
    return item
}

export function fixture(source: 'tree' | 'stone' = 'tree', remaining = 8) {
    const bounds = { x: 160, y: 160, width: 48, height: 32 }
    const node: AdventureResourceNode = {
        id: 'tree-one',
        source,
        phase: 'ready',
        remaining,
        readyAt: 0,
        kind: source === 'tree' ? 'wood' : 'stone',
        locationId: 'map-2-2',
        position: { x: 184, y: 184 },
        bounds,
        matureBounds: bounds,
        collisionBounds: bounds,
    }
    const plantable = Array.from({ length: 1024 }, () => true)
    const navigation = new NavigationService({
        id: 'map-2-2',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array.from({ length: 1024 }, () => false),
        solidLayerNames: [],
        plantable,
    })
    const actor = new GameCharacter({
        id: 'hero',
        nickname: 'Hero',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 184, y: 224 },
    })
    actor.equipment.weapon = createItemInstance(
        source === 'tree' ? 'axe' : 'pickaxe'
    )
    const resources = new AdventureResources([node])
    const state = createAdventureState()
    const clock = { now: 0 }
    const update = () => resources.update(clock.now, () => navigation, [actor])
    update()
    const gather = () =>
        resources.handle(
            actor,
            state,
            { type: 'gather', nodeId: node.id },
            clock.now,
            navigation
        )
    return {
        actor,
        state,
        clock,
        navigation,
        resources,
        gather,
        update,
        node,
        plantable,
    }
}
