import {
    type AdventureResourceNode,
    itemDurability,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureResources } from '../src/game/adventureResources'
import { GameCharacter } from '../src/game/character'
import { TREE_GROW_MS } from '../src/game/harvestResources'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { fixture } from './harvestTestHelpers'

it('clears a stump with an axe, frees its whole footprint and replants using a fresh identity', () => {
    const f = fixture('tree', 1)
    for (let index = 0; index < 3; index++) {
        f.gather()
        f.clock.now += 2_000
    }
    const clear = () =>
        f.resources.handle(
            f.actor,
            f.state,
            { type: 'gather', nodeId: f.node.id, operation: 'clear_stump' },
            f.clock.now,
            f.navigation
        )
    f.actor.equipment.weapon = createItemInstance('old_sword')
    expect(clear()).toEqual([])
    expect(f.resources.snapshot()[0]?.phase).toBe('stump')
    f.actor.equipment.weapon = createItemInstance('axe')
    const energy = f.actor.energy
    expect(clear()[0]?.kind).toBe('resource_gather')
    expect(f.actor.energy).toBe(energy - 5)
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
    expect(f.resources.snapshot()[0]).toMatchObject({
        phase: 'removed',
        remaining: 0,
    })
    expect(f.navigation.isSolidTile({ x: 11, y: 11 })).toBe(false)
    f.clock.now += 2000
    expect(
        f.resources.handle(
            f.actor,
            f.state,
            { type: 'plant_tree', position: f.node.position },
            f.clock.now,
            f.navigation
        )[0]?.kind
    ).toBe('tree_plant')
    const planted = f.resources.snapshot().find((node) => node.id !== f.node.id)
    expect(planted).toMatchObject({
        phase: 'growing',
        treeSize: 'adult',
        treeProfile: 'forest',
    })
    expect(planted?.id).not.toBe(f.node.id)
    f.clock.now += 2000
    expect(
        f.resources.handle(
            f.actor,
            f.state,
            {
                type: 'gather',
                nodeId: planted?.id ?? '',
                operation: 'cut_sapling',
            },
            f.clock.now,
            f.navigation
        )[0]?.kind
    ).toBe('notice')
    expect(
        f.resources.snapshot().find((node) => node.id === planted?.id)?.phase
    ).toBe('removed')
    f.clock.now += TREE_GROW_MS
    f.update()
    expect(
        f.resources.snapshot().find((node) => node.id === planted?.id)?.phase
    ).toBe('removed')
})
it('small trees give two wood and one brushwood, no saplings or stump', () => {
    const f = fixture('tree', 2)
    const small = { ...f.node, treeSize: 'small' as const }
    const resources = new AdventureResources([small])
    resources.update(0, () => f.navigation, [f.actor])
    for (let index = 0; index < 6; index++) {
        resources.handle(
            f.actor,
            f.state,
            { type: 'gather', nodeId: small.id },
            index * 2000,
            f.navigation
        )
    }
    expect(resources.snapshot()[0]?.phase).toBe('removed')
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
    expect(countInventoryItem(f.actor.inventory, 'brushwood')).toBe(1)
    expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(0)
})
it.each([
    [undefined, 800, 1, undefined],
    ['axe', 400, 1, 999],
    ['old_sword', 600, 2, 199],
] as const)(
    'collects two bush units with %s, applying the shared cost and cooldown',
    (itemId, interval, energy, durability) => {
        const f = fixture()
        const node: AdventureResourceNode = {
            ...f.node,
            source: 'bush',
            kind: 'brushwood',
            remaining: 2,
        }
        const resources = new AdventureResources([node])
        resources.update(0, () => f.navigation, [f.actor])
        if (itemId === undefined) {
            delete f.actor.equipment.weapon
        } else {
            f.actor.equipment.weapon = createItemInstance(itemId)
        }
        const before = f.actor.energy
        const gather = (now: number) =>
            resources.handle(
                f.actor,
                f.state,
                { type: 'gather', nodeId: node.id },
                now,
                f.navigation
            )
        expect(gather(0)[0]?.kind).toBe('resource_gather')
        expect(f.actor.energy).toBe(before - energy)
        if (f.actor.equipment.weapon !== undefined) {
            expect(itemDurability(f.actor.equipment.weapon)).toBe(durability)
        }
        expect(gather(interval - 1)).toEqual([])
        expect(gather(interval)[0]?.kind).toBe('resource_gather')
        expect(resources.snapshot()[0]?.phase).toBe('removed')
        expect(countInventoryItem(f.actor.inventory, 'brushwood')).toBe(2)
        expect(
            f.actor.inventory.filter((item) => item.itemId === 'brushwood')
        ).toHaveLength(1)
        expect(gather(interval * 2)).toEqual([])
    }
)
it('collects dry branches without tool or energy and does not regrow them', () => {
    const f = fixture()
    const node: AdventureResourceNode = {
        ...f.node,
        source: 'branches',
        kind: 'brushwood',
        remaining: 1,
    }
    delete node.collisionBounds
    const resources = new AdventureResources([node])
    f.actor.energy = 0
    delete f.actor.equipment.weapon
    resources.update(0, () => f.navigation, [f.actor])
    expect(
        resources.handle(
            f.actor,
            f.state,
            { type: 'gather', nodeId: node.id },
            0,
            f.navigation
        )[0]?.kind
    ).toBe('resource_gather')
    expect(f.actor.energy).toBe(0)
    expect(f.state.gatherAllowedAt).toBe(800)
    resources.update(TREE_GROW_MS * 100, () => f.navigation, [f.actor])
    expect(resources.snapshot()[0]?.phase).toBe('removed')
})
it('preview permits leaving a future trunk and rejects other occupants', () => {
    const f = fixture()
    f.actor.position = { x: 328, y: 328 }
    const result = f.resources.previewPlant(
        f.actor,
        f.actor.position,
        f.navigation
    )
    expect(result.available).toBe(true)
    expect(result.approach).toBeDefined()
    f.resources.update(0, () => f.navigation, [
        f.actor,
        new GameCharacter({
            id: 'other',
            nickname: 'Other',
            archetype: 'human',
            controllerKind: 'scripted',
            spawnPosition: f.actor.position,
        }),
    ])
    expect(
        f.resources.previewPlant(f.actor, f.actor.position, f.navigation)
            .available
    ).toBe(false)
})
