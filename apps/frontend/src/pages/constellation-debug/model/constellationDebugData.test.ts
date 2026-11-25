import { constellationIds, type HeroClass } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { generateConstellationLayout } from '../../../../../backend/src/game/constellationLayout'
import { fullConstellationCatalog } from '../../../../../backend/src/game/constellationNodes'
import { buildConstellationDebugSnapshot } from './constellationDebugData'

const options = { heroClass: 'cleric' as HeroClass, seed: 'debug-preview-test' }

describe('standalone constellation debug data', () => {
    it('reveals the complete authored catalog with canonical identities and actual geometry', () => {
        const snapshot = buildConstellationDebugSnapshot(options)
        expect(snapshot.paths.map(({ id }) => id)).toEqual([...constellationIds])
        expect(snapshot.nodes).toHaveLength(fullConstellationCatalog.length)
        expect(snapshot.edges).toHaveLength(
            fullConstellationCatalog.reduce((count, node) => count + node.parents.length, 0)
        )
        expect(new Set(snapshot.nodes.map((node) => node.id)).size).toBe(
            fullConstellationCatalog.length
        )
        const realized = generateConstellationLayout(
            fullConstellationCatalog,
            options.seed,
            'prayer'
        )
        expect(snapshot.layout).toEqual(realized.layout)
        expect(snapshot.layout?.minimumNodeSpacing).toBeGreaterThanOrEqual(80)
        const ids = new Set(snapshot.nodes.map((node) => node.id))
        for (const path of snapshot.paths) {
            expect(path.unlocked).toBe(true)
            expect(path.name).toEqual(expect.any(String))
            expect(path.description).toEqual(expect.any(String))
        }
        for (const node of snapshot.nodes) {
            const authored = fullConstellationCatalog.find((entry) => entry.id === node.id)
            expect(node).toMatchObject({
                ...realized.positions[node.id],
                unlocked: true,
                kind: authored?.kind,
                name: authored?.name,
                description: authored?.description,
                effectType: authored?.effectType,
                parents: authored?.parents,
            })
            const authoredEffects = [...(authored?.results ?? []), ...(authored?.effects ?? [])]
            expect(node.effects).toEqual(authoredEffects.length === 0 ? undefined : authoredEffects)
            expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true)
        }
        for (const edge of snapshot.edges) {
            expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true)
            expect(snapshot.nodes.find((node) => node.id === edge.to)?.parents).toContain(edge.from)
            expect(edge.via).toEqual(realized.edgeWaypoints[`${edge.from}>${edge.to}`])
        }
        expect(snapshot.nodes.filter((node) => node.effectType === 'active')).toHaveLength(25)
        expect(snapshot.nodes.find((node) => node.id === 'prayer.revive')?.effectType).toBe(
            'passive'
        )
        expect(snapshot.nodes.find((node) => node.id === 'prayer_grave.revive')?.effectType).toBe(
            'passive'
        )
        expect(JSON.stringify(snapshot)).not.toMatch(
            /diagnostics|usedFallback|seed|practice|receipts/
        )
    })

    it.each([
        ['vanguard', 'blade'],
        ['arcanist', 'magic'],
        ['cleric', 'prayer'],
        ['ranger', 'arrow'],
    ] as const)('centers %s on the canonical %s root', (heroClass, path) => {
        const snapshot = buildConstellationDebugSnapshot({ ...options, heroClass })
        expect(snapshot.layout?.centerNodeId).toBe(`${path}.root`)
        expect(snapshot.nodes.find((node) => node.id === `${path}.root`)).toMatchObject({
            x: 0,
            y: 0,
        })
    })

    it('is deterministic while another seed changes the realized positions', () => {
        const first = buildConstellationDebugSnapshot(options)
        expect(buildConstellationDebugSnapshot(options)).toEqual(first)
        const second = buildConstellationDebugSnapshot({
            ...options,
            seed: 'another-debug-preview',
        })
        expect(second.nodes.map(({ id, x, y }) => ({ id, x, y }))).not.toEqual(
            first.nodes.map(({ id, x, y }) => ({ id, x, y }))
        )
    })

    it('never mutates or shares nested arrays with the catalog or another preview', () => {
        const originalCatalog = structuredClone(fullConstellationCatalog)
        const first = buildConstellationDebugSnapshot(options)
        const second = buildConstellationDebugSnapshot(options)
        const root = first.nodes.find((node) => node.id === 'prayer.root')
        const child = first.nodes.find((node) => node.id === 'prayer.radius1')
        const untouched = structuredClone(second)
        expect(root?.effects).not.toBe(
            fullConstellationCatalog.find((node) => node.id === 'prayer.root')?.effects
        )
        expect(child?.parents).not.toBe(
            fullConstellationCatalog.find((node) => node.id === 'prayer.radius1')?.parents
        )
        root?.effects?.push('Changed debug effect')
        child?.parents.push('foreign.root')
        if (root !== undefined) root.name = 'Changed debug root'
        if (first.layout !== undefined) {
            first.layout.bounds.x += 100
            first.layout.regions.prayer.width += 100
        }
        first.paths.splice(0, 1)
        first.edges.splice(0, 1)
        first.nodes.splice(0, 1)
        expect(second).toEqual(untouched)
        expect(buildConstellationDebugSnapshot(options)).toEqual(untouched)
        expect(fullConstellationCatalog).toEqual(originalCatalog)
    })
})
