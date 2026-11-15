import { afterEach, describe, expect, it, vi } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    disableConstellationStar,
    enableAllConstellationStars,
    enableConstellationStar,
    initialConstellationBuild,
} from './constellationBuild'

afterEach(() => vi.restoreAllMocks())

function validBuild(ids: ReadonlySet<string>) {
    const active = fullConstellationCatalog.filter((star) => ids.has(star.id))
    expect(active.every((star) => star.parents.every((parent) => ids.has(parent)))).toBe(true)
}

describe('manual constellation build dependencies', () => {
    it.each([
        ['vanguard', 'blade.root'],
        ['arcanist', 'magic.root'],
        ['cleric', 'prayer.root'],
        ['ranger', 'arrow.root'],
    ] as const)('starts %s with exactly its own root', (heroClass, root) => {
        expect([...initialConstellationBuild(heroClass)]).toEqual([root])
    })

    it('blocks a descendant without automatically opening missing parents', () => {
        const initial = initialConstellationBuild('cleric')
        const blocked = enableConstellationStar(initial, 'prayer.harm2')
        expect(blocked).toMatchObject({
            changed: false,
            missingParents: ['prayer.harm1'],
            disabledIds: [],
        })
        expect([...blocked.enabledIds]).toEqual(['prayer.root'])
        const harm = enableConstellationStar(initial, 'prayer.harm')
        expect(harm.changed).toBe(true)
        expect(enableConstellationStar(harm.enabledIds, 'prayer.harm2').missingParents).toEqual([
            'prayer.harm1',
        ])
        const answer = enableConstellationStar(harm.enabledIds, 'prayer.harm1')
        const anger = enableConstellationStar(answer.enabledIds, 'prayer.harm2')
        expect(anger.changed).toBe(true)
        validBuild(anger.enabledIds)
        expect([...initial]).toEqual(['prayer.root'])
    })

    it('requires both immediate parents for area prayer and cross-path stars', () => {
        const gift = new Set(['prayer.root', 'prayer.gift1'])
        expect(enableConstellationStar(gift, 'prayer.area').missingParents).toEqual([
            'prayer.radius1',
        ])
        gift.add('prayer.radius1')
        expect(enableConstellationStar(gift, 'prayer.area').changed).toBe(true)
        expect(enableConstellationStar(gift, 'prayer.last_light').missingParents).toEqual([
            'life.hp1',
        ])
        const body = new Set([...gift, 'life.root', 'life.hp1'])
        expect(enableConstellationStar(body, 'prayer.last_light').changed).toBe(true)
        const magic = new Set(['magic.root', 'magic.spark_damage'])
        expect(enableConstellationStar(magic, 'magic.runic_echo').missingParents).toEqual([
            'arrow.damage1',
        ])
        magic.add('arrow.root')
        magic.add('arrow.damage1')
        expect(enableConstellationStar(magic, 'magic.runic_echo').changed).toBe(true)
    })
})

describe('manual constellation build cascades and isolation', () => {
    it('preserves every dependency when any of the 77 stars is disabled', () => {
        const all = enableAllConstellationStars()
        for (const star of fullConstellationCatalog) {
            const result = disableConstellationStar(all, star.id)
            expect(result.enabledIds.has(star.id)).toBe(false)
            expect(result.disabledIds.every((id) => !result.enabledIds.has(id))).toBe(true)
            validBuild(result.enabledIds)
        }
        expect(all.size).toBe(77)
    })

    it('cascades all transitive descendants without removing an independent joint parent', () => {
        const all = enableAllConstellationStars()
        const removed = disableConstellationStar(all, 'prayer.gift1')
        expect(removed.disabledIds).toEqual(
            expect.arrayContaining([
                'prayer.gift1',
                'prayer.gift2',
                'prayer.area',
                'prayer.last_light',
            ])
        )
        expect(removed.enabledIds.has('prayer.radius1')).toBe(true)
        expect(removed.enabledIds.has('life.hp1')).toBe(true)
        validBuild(removed.enabledIds)
        const noBody = disableConstellationStar(all, 'life.hp1')
        expect(noBody.disabledIds).toEqual(
            expect.arrayContaining([
                'life.hp1',
                'life.hp2',
                'life.hp3',
                'life.hp4',
                'prayer.last_light',
            ])
        )
        expect(noBody.enabledIds.has('prayer.gift1')).toBe(true)
        validBuild(noBody.enabledIds)
        const noArrow = disableConstellationStar(all, 'arrow.root')
        expect(noArrow.enabledIds.has('magic.runic_echo')).toBe(false)
        expect(noArrow.enabledIds.has('magic.spark_damage')).toBe(true)
        expect(noArrow.enabledIds.has('magic.root')).toBe(true)
        validBuild(noArrow.enabledIds)
        expect(all.size).toBe(77)
    })

    it('makes repeated or unknown operations explicit no-ops with independent output sets', () => {
        const initial = initialConstellationBuild('cleric')
        for (const result of [
            enableConstellationStar(initial, 'prayer.root'),
            disableConstellationStar(initial, 'prayer.harm'),
        ]) {
            expect(result.changed).toBe(false)
            expect(result.enabledIds).toEqual(initial)
            expect(result.enabledIds).not.toBe(initial)
        }
        for (const operation of [enableConstellationStar, disableConstellationStar]) {
            const result = operation(initial, 'unknown.root')
            expect(result.error).toBe('Звезда не найдена.')
            expect(result.changed).toBe(false)
            result.enabledIds.clear()
            expect([...initial]).toEqual(['prayer.root'])
        }
    })

    it('enables all 77 nodes in topology order, without skill gates or randomness', () => {
        const before = JSON.stringify(fullConstellationCatalog)
        vi.spyOn(Math, 'random').mockImplementation(() => {
            throw new Error('Not gameplay RNG')
        })
        const all = enableAllConstellationStars()
        expect(all.size).toBe(77)
        const visited = new Set<string>()
        for (const id of all) {
            const star = fullConstellationCatalog.find((entry) => entry.id === id)
            expect(star?.parents.every((parent) => visited.has(parent))).toBe(true)
            visited.add(id)
        }
        expect(enableConstellationStar(new Set(), 'prayer_grave.root').changed).toBe(true)
        expect(enableConstellationStar(new Set(['magic.root']), 'magic.fireball').changed).toBe(
            true
        )
        expect(all).not.toBe(enableAllConstellationStars())
        expect(JSON.stringify(fullConstellationCatalog)).toBe(before)
    })
})
