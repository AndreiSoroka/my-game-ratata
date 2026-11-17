import { graveBounds } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { retireCharacter } from '../src/game/characterLife'
import { finalGravePosition } from '../src/game/gravePlacement'
import { NavigationService } from '../src/game/navigation'
import { territories } from '../src/game/pursuitState'
import { graveFixture, graveHero, graveNavigation } from './graveTestHelpers'

describe('final grave edge margins', () => {
    it.each([
        { death: { x: 8, y: 168 }, expected: { x: 40, y: 168 } },
        { death: { x: 312, y: 168 }, expected: { x: 280, y: 168 } },
        { death: { x: 168, y: 8 }, expected: { x: 168, y: 40 } },
        { death: { x: 168, y: 312 }, expected: { x: 168, y: 280 } },
        { death: { x: 8, y: 8 }, expected: { x: 40, y: 40 } },
        { death: { x: 312, y: 8 }, expected: { x: 280, y: 40 } },
        { death: { x: 8, y: 312 }, expected: { x: 40, y: 280 } },
        { death: { x: 312, y: 312 }, expected: { x: 280, y: 280 } },
    ])(
        'places a grave inward from $death without moving the body',
        ({ death, expected }) => {
            const f = graveFixture()
            const hero = graveHero()
            hero.position = { ...death }
            hero.applyDamage(hero.hp, 1_000)
            retireCharacter(hero)
            f.service.schedule(hero, 1_000, f.navigation)
            const grave = f.service.get(`final:${hero.id}`)
            expect(grave?.position).toEqual(expected)
            expect(hero.position).toEqual(death)
            f.service.update(31_000, f.context)
            const child = f.created[0]?.character
            expect(child).toBeDefined()
            if (child === undefined) {
                throw new Error('Missing grave child')
            }
            expect(f.navigation.clampWorld(child.position)).toEqual(
                child.position
            )
            expect(
                f.navigation.isSolidTile(
                    f.navigation.worldToTile(child.position)
                )
            ).toBe(false)
            expect(territories.get(child)?.position).toEqual(expected)
        }
    )

    it.each([
        { x: 123.5, y: 178.25 },
        { x: 40, y: 40 },
        { x: 280, y: 280 },
    ])('preserves the exact safe position $x, $y', (death) => {
        expect(finalGravePosition(death, graveNavigation())).toEqual(death)
    })

    it('counts two tiles independently on non-square terrain', () => {
        const navigation = new NavigationService({
            ...graveNavigation().grid,
            tileWidth: 12,
            tileHeight: 20,
        })
        const point = finalGravePosition({ x: 6, y: 390 }, navigation)
        expect(point).toEqual({ x: 32, y: 352 })
        if (point === undefined) {
            throw new Error('Missing final grave position')
        }
        expect(graveBounds(point)).toEqual({
            x: 24,
            y: 344,
            width: 16,
            height: 16,
        })
    })
})

describe('safe final grave placement', () => {
    it.each([
        {
            death: { x: 8, y: 168 },
            blocked: { x: 2, y: 10 },
            expected: { x: 40, y: 152 },
        },
        {
            death: { x: 168, y: 8 },
            blocked: { x: 10, y: 2 },
            expected: { x: 152, y: 40 },
        },
    ])(
        'chooses the nearest clear ground with stable ties from $death',
        ({ death, blocked, expected }) => {
            const navigation = graveNavigation()
            navigation.grid.solid[
                blocked.y * navigation.grid.width + blocked.x
            ] = true
            expect(finalGravePosition(death, navigation)).toEqual(expected)
        }
    )

    it('checks the whole footprint when the inward point is between tile centers', () => {
        const navigation = graveNavigation()
        navigation.grid.solid[11 * navigation.grid.width + 2] = true
        expect(finalGravePosition({ x: 8, y: 170 }, navigation)).toEqual({
            x: 40,
            y: 168,
        })
    })

    it('does not place a grave across an impassable wall', () => {
        const navigation = graveNavigation()
        for (let y = 0; y < navigation.grid.height; y++) {
            navigation.grid.solid[y * navigation.grid.width + 1] = true
        }
        expect(finalGravePosition({ x: 8, y: 168 }, navigation)).toBeUndefined()
    })

    it('does not register a source or spawn skeletons when the inset is blocked', () => {
        const f = graveFixture()
        f.navigation.grid.solid.fill(true)
        f.navigation.grid.solid[0] = false
        const hero = graveHero()
        hero.position = { x: 8, y: 8 }
        hero.applyDamage(hero.hp, 1_000)
        retireCharacter(hero)
        f.service.schedule(hero, 1_000, f.navigation)
        f.service.update(31_000, f.context)
        expect(f.service.snapshot(hero.locationId)).toEqual([])
        expect(f.created).toEqual([])
    })

    it('rejects maps too small for the footprint and both margins', () => {
        const navigation = new NavigationService({
            ...graveNavigation().grid,
            width: 4,
            height: 4,
            solid: Array<boolean>(16).fill(false),
        })
        expect(finalGravePosition({ x: 8, y: 8 }, navigation)).toBeUndefined()
    })
})
