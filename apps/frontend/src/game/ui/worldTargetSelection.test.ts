import type { AbilityId, AdventureResourceNode } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'
import {
    isWorldTargetEligible,
    nextWorldTarget,
    selectableWorldTargets,
    worldSelectionRange,
    type WorldSelectionTarget,
    worldTargetCandidates,
} from './worldTargetSelection'

function playerWithAbilities(known: AbilityId[]) {
    return characterFixture('self', {
        abilities: { known, cooldowns: {}, casting: null, barrier: null },
    })
}

function itemTarget(id: string, x: number): WorldSelectionTarget {
    return { key: `item:${id}`, id, kind: 'item', name: id, position: { x, y: 0 } }
}

describe('world target selection range', () => {
    it('keeps a twelve-tile minimum and adds three tiles to every learned ability range', () => {
        expect(worldSelectionRange(characterFixture('self'), 16)).toBe(192)
        expect(worldSelectionRange(playerWithAbilities([]), 16)).toBe(192)
        expect(worldSelectionRange(playerWithAbilities(['shot', 'spark']), 16)).toBe(192)
        expect(worldSelectionRange(playerWithAbilities(['fireball']), 16)).toBe(208)
        expect(worldSelectionRange(playerWithAbilities(['greater_fireball', 'shot']), 16)).toBe(240)
        expect(worldSelectionRange(playerWithAbilities(['spark']), 8)).toBe(104)
        expect(worldSelectionRange(playerWithAbilities(['greater_fireball']), 20)).toBe(300)
    })

    it('requires both nearby distance and actual visibility, including the exact boundary', () => {
        const player = characterFixture('self')
        expect(isWorldTargetEligible(itemTarget('edge', 192), player, 192, () => true)).toBe(true)
        expect(isWorldTargetEligible(itemTarget('far', 192.01), player, 192, () => true)).toBe(
            false
        )
        expect(isWorldTargetEligible(itemTarget('hidden', 16), player, 192, () => false)).toBe(
            false
        )
        expect(
            isWorldTargetEligible(
                itemTarget('near', 16),
                { ...player, alive: false },
                192,
                () => true
            )
        ).toBe(false)
        expect(
            isWorldTargetEligible(
                itemTarget('near', 16),
                { ...player, tags: ['offline'] },
                192,
                () => true
            )
        ).toBe(false)
    })

    it('measures large compound objects from their physical interaction surface', () => {
        const player = characterFixture('self')
        const target: WorldSelectionTarget = {
            key: 'world:water',
            id: 'water',
            kind: 'world',
            name: 'Вода',
            position: { x: 400, y: 400 },
            bounds: { x: 0, y: 0, width: 500, height: 500 },
            interactionAreas: [{ x: 192, y: 0, width: 16, height: 16 }],
        }
        expect(isWorldTargetEligible(target, player, 192, () => true)).toBe(true)
        expect(isWorldTargetEligible(target, player, 191, () => true)).toBe(false)
    })
})

describe('mixed target selection', () => {
    it('sorts all target kinds by distance independently of action reach and filters hidden/far targets', () => {
        const player = characterFixture('self')
        const snapshot = {
            ...worldFixture([
                player,
                characterFixture('enemy', {
                    faction: 'monsters',
                    position: { x: 150, y: 0 },
                }),
                characterFixture('friend', { position: { x: 64, y: 0 } }),
            ]),
            graves: [graveFixture({ id: 'grave', position: { x: 80, y: 0 } })],
            items: [
                { id: 'a', itemId: 'food' as const, position: { x: 16, y: 0 } },
                { id: 'b', itemId: 'food' as const, position: { x: 16, y: 0 } },
                { id: 'hidden', itemId: 'food' as const, position: { x: 8, y: 0 } },
                { id: 'far', itemId: 'food' as const, position: { x: 193, y: 0 } },
            ],
            chests: [
                {
                    id: 'chest',
                    position: { x: 64, y: 0 },
                    state: 'closed' as const,
                    itemCount: 0,
                },
            ],
            adventure: {
                ...adventureFixture(),
                worldObjects: [
                    {
                        id: 'sign',
                        kind: 'sign' as const,
                        name: 'Указатель',
                        position: { x: 28, y: 0 },
                        bounds: { x: 24, y: 0, width: 8, height: 16 },
                        depleted: false,
                    },
                ],
                resourceNodes: [resource('herbs', undefined, 1, 32)],
                farmPlots: [
                    {
                        id: 'plot',
                        name: 'Грядка',
                        locationId: 'map-2-2',
                        crop: 'wheat' as const,
                        position: { x: 48, y: 0 },
                        phase: 'growing' as const,
                        readyAt: 100,
                    },
                ],
            },
        }
        const targets = selectableWorldTargets(snapshot, player, {
            tileSize: 16,
            isVisible: (target) => target.id !== 'hidden',
        })
        expect(targets.map((target) => target.key)).toEqual([
            'item:a',
            'item:b',
            'world:sign',
            'resource:herbs',
            'farm:plot',
            'chest:chest',
            'character:friend',
            'grave:grave',
            'character:enemy',
        ])
        // The chest is empty, the farm is growing, and the enemy is outside starter attack reach.
        expect(targets.map((target) => target.kind)).toContain('chest')
        expect(targets.find((target) => target.id === 'enemy')?.relationship).toBe('hostile')
    })

    it('cycles nearest to farthest, reverses, wraps, and starts correctly from self or missing keys', () => {
        const targets = [itemTarget('near', 8), itemTarget('middle', 16), itemTarget('far', 24)]
        expect(nextWorldTarget(targets, undefined)).toBe('item:near')
        expect(nextWorldTarget(targets, 'character:self')).toBe('item:near')
        expect(nextWorldTarget(targets, undefined, true)).toBe('item:far')
        expect(nextWorldTarget(targets, 'item:near')).toBe('item:middle')
        expect(nextWorldTarget(targets, 'item:far')).toBe('item:near')
        expect(nextWorldTarget(targets, 'item:near', true)).toBe('item:far')
        expect(nextWorldTarget(targets, 'item:far', true)).toBe('item:middle')
        expect(nextWorldTarget([], 'item:near')).toBeUndefined()
        expect(nextWorldTarget([targets[0]!], 'item:near', true)).toBe('item:near')
    })
})

describe('functional target registry', () => {
    it('keeps living characters and recoverable allies, excluding self, offline and unavailable bodies', () => {
        const player = characterFixture('self')
        const life = { retired: false, reviveMsLeft: 100, reviveUntil: 100 }
        const characters = [
            player,
            characterFixture('alive'),
            characterFixture('dummy', { trainingTarget: { areaId: 'yard' } }),
            characterFixture('offline', { tags: ['offline'] }),
            characterFixture('recoverable', { alive: false, life }),
            characterFixture('expired', { alive: false, life: { ...life, reviveMsLeft: 0 } }),
            characterFixture('retired', { alive: false, life: { ...life, retired: true } }),
            characterFixture('dead-without-life', { alive: false }),
            characterFixture('dead-hostile', { alive: false, faction: 'monsters', life }),
        ]
        expect(
            worldTargetCandidates(worldFixture(characters), player).map((target) => target.id)
        ).toEqual(['alive', 'dummy', 'recoverable'])
        expect(
            worldTargetCandidates(worldFixture(characters), player, [characters[1]!]).map(
                (target) => target.id
            )
        ).toEqual(['alive'])
    })

    it('uses one barrel identity and one shared grave surface even outside interaction range', () => {
        const player = characterFixture('self')
        const position = { x: 400, y: 400 }
        const snapshot = {
            ...worldFixture([player]),
            graves: [graveFixture({ id: 'shared', position })],
            chests: [
                {
                    id: 'barrel',
                    kind: 'barrel' as const,
                    position: { x: 200, y: 0 },
                    state: 'closed' as const,
                    itemCount: 1,
                },
                {
                    id: 'shared-corpse',
                    kind: 'corpse' as const,
                    position,
                    state: 'closed' as const,
                    itemCount: 1,
                },
                {
                    id: 'separate-corpse',
                    kind: 'corpse' as const,
                    position: { x: 300, y: 0 },
                    state: 'closed' as const,
                    itemCount: 1,
                },
            ],
            adventure: {
                ...adventureFixture(),
                worldObjects: [
                    {
                        id: 'barrel',
                        kind: 'barrel' as const,
                        name: 'Бочка',
                        position: { x: 200, y: 0 },
                        bounds: { x: 192, y: -8, width: 16, height: 16 },
                        depleted: false,
                    },
                ],
            },
        }
        expect(worldTargetCandidates(snapshot, player).map((target) => target.key)).toEqual([
            'grave:shared',
            'chest:barrel',
            'chest:separate-corpse',
        ])
        snapshot.graves[0]!.phase = 'purified'
        expect(worldTargetCandidates(snapshot, player).map((target) => target.key)).toEqual([
            'chest:barrel',
            'chest:shared-corpse',
            'chest:separate-corpse',
        ])
    })

    it('keeps harvestable resources, stumps and growing trees while removing exhausted sources', () => {
        const player = characterFixture('self')
        const snapshot = {
            ...worldFixture([player]),
            adventure: {
                ...adventureFixture(),
                resourceNodes: [
                    resource('ready', undefined, 1),
                    resource('stump', 'stump', 0),
                    resource('growing', 'growing', 0),
                    resource('removed', 'removed', 1),
                    resource('depleted', 'depleted', 1),
                    resource('empty', undefined, 0),
                ],
            },
        }
        expect(worldTargetCandidates(snapshot, player).map((target) => target.id)).toEqual([
            'ready',
            'stump',
            'growing',
        ])
    })
})

function resource(
    id: string,
    phase: AdventureResourceNode['phase'],
    remaining: number,
    x = 0
): AdventureResourceNode {
    return { id, phase, remaining, kind: 'wood', locationId: 'map-2-2', position: { x, y: 0 } }
}
