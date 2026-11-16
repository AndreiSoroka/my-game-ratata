import { describe, expect, it } from 'vitest'

import { NavigationService } from '../src/game/navigation'
import { resolveRouteDestination } from '../src/game/routeDestination'
import { routeFixture } from './routeTestHelpers'

describe('exact-first reachable route destinations', () => {
    it('keeps an exact off-center coordinate when reachable without changing inputs or the grid', () => {
        const { navigation } = routeFixture()
        const from = { x: 40, y: 40 }
        const requested = { x: 103, y: 91 }
        const solid = navigation.grid.solid.slice()
        const result = resolveRouteDestination(from, requested, navigation)
        expect(result?.destination).toEqual(requested)
        expect(result?.path.at(-1)).toEqual(requested)
        expect(result?.requestedPosition).toEqual(requested)
        expect(from).toEqual({ x: 40, y: 40 })
        expect(requested).toEqual({ x: 103, y: 91 })
        expect(navigation.grid.solid).toEqual(solid)
    })

    it('chooses a nearby walkable destination by distance to the requested point, then origin', () => {
        const { navigation } = routeFixture()
        navigation.grid.solid[6 * 20 + 6] = true
        const result = resolveRouteDestination(
            { x: 40, y: 104 },
            { x: 104, y: 104 },
            navigation
        )
        expect(result?.destination).toEqual({ x: 88, y: 104 })
        expect(result?.path.at(-1)).toEqual(result?.destination)
        expect(result?.requestedPosition).toEqual({ x: 104, y: 104 })
    })

    it('resolves symmetric ties deterministically by y then x', () => {
        const { navigation } = routeFixture()
        const point = { x: 104, y: 104 }
        navigation.grid.solid[6 * 20 + 6] = true
        expect(
            resolveRouteDestination({ x: 40, y: 40 }, point, navigation)
                ?.destination
        ).toEqual({ x: 104, y: 88 })
        for (const [x, y] of [
            [5, 6],
            [7, 6],
            [6, 5],
            [6, 7],
        ]) {
            if (x === undefined || y === undefined) {
                throw new Error('Missing candidate tile')
            }
            navigation.grid.solid[y * 20 + x] = true
        }
        expect(
            resolveRouteDestination({ x: 104, y: 40 }, point, navigation)
                ?.destination
        ).toEqual({ x: 88, y: 88 })
    })

    it('skips a closer free but disconnected cell and accepts a reachable cell exactly two tiles away', () => {
        const { navigation } = routeFixture()
        navigation.grid.solid.fill(true)
        for (let x = 2; x <= 5; x++) {
            navigation.grid.solid[7 * 20 + x] = false
        }
        // This nearer free cell is isolated by solid neighbors.
        navigation.grid.solid[6 * 20 + 7] = false
        const result = resolveRouteDestination(
            { x: 40, y: 120 },
            { x: 120, y: 120 },
            navigation
        )
        expect(result?.destination).toEqual({ x: 88, y: 120 })
        expect(result?.path.at(-1)).toEqual({ x: 88, y: 120 })
    })

    it('rejects a free destination and all neighboring cells when their component is unreachable', () => {
        const { navigation, divideMap } = routeFixture()
        divideMap()
        expect(
            resolveRouteDestination(
                { x: 40, y: 40 },
                { x: 120, y: 40 },
                navigation
            )
        ).toBeUndefined()
    })

    it('never expands the search outside the circular two-cell radius', () => {
        const { navigation } = routeFixture()
        navigation.grid.solid.fill(true)
        for (let x = 2; x <= 5; x++) {
            navigation.grid.solid[5 * 20 + x] = false
        }
        expect(
            navigation.findPathWorld({ x: 40, y: 88 }, { x: 88, y: 88 }).length
        ).toBeGreaterThan(0)
        expect(
            resolveRouteDestination(
                { x: 40, y: 88 },
                { x: 120, y: 120 },
                navigation
            )
        ).toBeUndefined()
    })
})

describe('route resolution map geometry', () => {
    it('uses tile dimensions for the radius, including rectangular tiles', () => {
        const navigation = new NavigationService({
            id: 'rectangle',
            width: 20,
            height: 20,
            tileWidth: 16,
            tileHeight: 32,
            solid: new Array<boolean>(400).fill(true),
            solidLayerNames: [],
        })
        for (let x = 2; x <= 7; x++) {
            navigation.grid.solid[x] = false
        }
        navigation.grid.solid[20 + 7] = false
        navigation.grid.solid[40 + 7] = false
        expect(
            resolveRouteDestination(
                { x: 40, y: 16 },
                { x: 120, y: 144 },
                navigation
            )?.destination
        ).toEqual({ x: 120, y: 80 })
    })

    it('keeps boundary clamping and excludes out-of-map fallback cells', () => {
        const { navigation } = routeFixture()
        expect(
            resolveRouteDestination(
                { x: 40, y: 40 },
                { x: -100, y: -100 },
                navigation
            )?.destination
        ).toEqual({ x: 8, y: 8 })
        navigation.grid.solid[0] = true
        const result = resolveRouteDestination(
            { x: 40, y: 40 },
            { x: -100, y: -100 },
            navigation
        )
        expect(result?.requestedPosition).toEqual({ x: 8, y: 8 })
        expect(result?.destination).toEqual({ x: 24, y: 8 })
    })

    it.each([NaN, Infinity, -Infinity])(
        'rejects non-finite coordinates (%s)',
        (value) => {
            const { navigation } = routeFixture()
            expect(
                resolveRouteDestination(
                    { x: 40, y: 40 },
                    { x: value, y: 40 },
                    navigation
                )
            ).toBeUndefined()
            expect(
                resolveRouteDestination(
                    { x: value, y: 40 },
                    { x: 40, y: 40 },
                    navigation
                )
            ).toBeUndefined()
        }
    )
})
