import type { HeroClass } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import type { CompanionWorld } from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { restoreCharacter } from '../src/game/characterRecovery'
import { CompanionService } from '../src/game/companions'
import { constellationWireId } from '../src/game/constellationNodes'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { NavigationService } from '../src/game/navigation'
import {
    prepareConstellationLayout,
    readCachedConstellationLayout,
} from '../src/game/personalConstellationSky'

function identity(heroClass?: HeroClass) {
    return new GameCharacter({
        id: 'same-logical-name',
        nickname: 'Sky',
        archetype: heroClass === undefined ? 'slime' : 'human',
        ...(heroClass === undefined ? {} : { heroClass }),
        controllerKind: 'scripted',
        spawnPosition: { x: 100, y: 100 },
    })
}

describe('private identity-owned constellation sky', () => {
    it.each([
        ['vanguard', 'blade'],
        ['arcanist', 'magic'],
        ['cleric', 'prayer'],
        ['ranger', 'arrow'],
        [undefined, 'life'],
    ] as const)(
        'centers %s on %s without granting an unearned root',
        (heroClass, path) => {
            const actor = identity(heroClass)
            const rootsBefore = [...actor.progression.constellations.opened]
            prepareConstellationLayout(actor)
            const snapshot = snapshotConstellations(actor)
            expect(snapshot.layout?.centerNodeId).toBe(
                constellationWireId(`${path}.root`)
            )
            expect(actor.progression.constellations.opened).toEqual(
                new Set(rootsBefore)
            )
            expect(
                snapshot.nodes.find(
                    (node) => node.id === snapshot.layout?.centerNodeId
                )?.unlocked
            ).toBe(heroClass !== undefined)
        }
    )

    it('does not generate during public or unprepared internal snapshot reads', () => {
        const actor = identity()
        expect(readCachedConstellationLayout(actor)).toBeUndefined()
        expect(actor.snapshot(1000, false).progression).not.toHaveProperty(
            'constellations'
        )
        expect(actor.snapshot(1000, true).progression).not.toHaveProperty(
            'constellations'
        )
        expect(() => snapshotConstellations(actor)).toThrow(
            /Prepare the personal constellation layout/
        )
        expect(readCachedConstellationLayout(actor)).toBeUndefined()
    })

    it('caches and freezes one realized map without touching gameplay randomness', () => {
        const actor = identity('arcanist')
        const random = vi.spyOn(Math, 'random')
        const cached = prepareConstellationLayout(actor)
        expect(prepareConstellationLayout(actor)).toBe(cached)
        expect(readCachedConstellationLayout(actor)).toBe(cached)
        const first = snapshotConstellations(actor)
        expect(snapshotConstellations(actor)).toEqual(first)
        expect(random).not.toHaveBeenCalled()
        expect(Object.isFrozen(cached)).toBe(true)
        expect(Object.isFrozen(cached.layout)).toBe(true)
        expect(Object.isFrozen(cached.layout.bounds)).toBe(true)
        expect(Object.isFrozen(cached.positions)).toBe(true)
        const root = cached.positions['magic.root']
        expect(Object.isFrozen(root)).toBe(true)
        expect(root !== undefined && Reflect.set(root, 'x', 12345)).toBe(false)
        if (first.layout === undefined) {
            throw new Error('Prepared layout is missing')
        }
        first.layout.bounds.x -= 10
        first.nodes[0]?.parents.push('foreign-id')
        expect(snapshotConstellations(actor)).not.toEqual(first)
        expect(JSON.stringify(actor.snapshot(1000))).not.toMatch(
            /seed|activationAbilityId|magic\.spark_range/
        )
        expect(JSON.stringify(actor.constellationSky)).toBe('{}')
        expect(actor.snapshot(1000, false).progression).not.toHaveProperty(
            'constellations'
        )
        expect(JSON.stringify(actor.snapshot(1000))).not.toContain(
            'usedFallback'
        )
    })

    it('retains geometry through discovery, travel, temporary death and retirement of the same identity', () => {
        const actor = identity('ranger')
        const cached = prepareConstellationLayout(actor)
        const before = snapshotConstellations(actor)
        actor.progression.constellations.opened.add('arrow.damage1')
        actor.progression.constellations.opened.add('life.root')
        actor.locationId = 'map-0-0'
        actor.applyDamage(actor.hp, 1000)
        restoreCharacter(actor, 2000, false)
        expect(readCachedConstellationLayout(actor)).toBe(cached)
        const after = snapshotConstellations(actor)
        expect(after.layout).toEqual(before.layout)
        for (const node of before.nodes) {
            expect(
                after.nodes.find((entry) => entry.id === node.id)
            ).toMatchObject({ x: node.x, y: node.y })
        }
        retireCharacter(actor)
        expect(readCachedConstellationLayout(actor)).toBe(cached)
        expect(prepareConstellationLayout(actor)).toBe(cached)
    })
})

describe('private sky control lifecycle', () => {
    it('prepares an accepted model lease once while rejecting invalid intentions without generation', () => {
        const actor = identity('vanguard')
        const service = new CompanionService()
        const navigation = new NavigationService({
            id: 'sky-lease',
            width: 20,
            height: 20,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(400).fill(false),
            solidLayerNames: [],
        })
        const world: CompanionWorld = {
            getCharacter: () => actor,
            navigationFor: () => navigation,
            findVisibleTarget: () => undefined,
            requestAttack: () => undefined,
        }
        expect(
            service.decide(actor, { type: 'teleport' }, world, 1000).accepted
        ).toBe(false)
        expect(readCachedConstellationLayout(actor)).toBeUndefined()
        expect(
            service.decide(
                actor,
                { type: 'move', axis: { x: 1, y: 0 } },
                world,
                1000
            ).accepted
        ).toBe(true)
        const cached = readCachedConstellationLayout(actor)
        expect(cached).toBeDefined()
        expect(actor.snapshot(1000).progression?.constellations).toBeDefined()
        expect(
            service.decide(
                actor,
                { type: 'move', axis: { x: 0, y: 1 } },
                world,
                1100
            ).accepted
        ).toBe(true)
        expect(readCachedConstellationLayout(actor)).toBe(cached)
        expect(service.hasActiveLease(actor, 6100, world)).toBe(false)
        expect(readCachedConstellationLayout(actor)).toBe(cached)
    })

    it('gives each new identity an independent seed even when name, class and actor id match', () => {
        const first = identity('cleric')
        const second = identity('cleric')
        const firstSky = prepareConstellationLayout(first)
        retireCharacter(first)
        const secondSky = prepareConstellationLayout(second)
        expect(secondSky.positions).not.toEqual(firstSky.positions)
        expect(secondSky).not.toBe(firstSky)
    })
})
