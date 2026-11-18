import type {
    ConstellationId,
    ConstellationLayoutSnapshot,
    ConstellationRegion,
} from '@my-game-ratata/contracts'

import { skyComponents, variedComponent } from './constellationComponents'
import {
    constellationTopologyEdges,
    routeConstellationCrossLinks,
} from './constellationEdgeRouting'
import {
    constellationGeometryProblem,
    distanceSquared,
    type SkyPoint,
} from './constellationGeometry'
import type {
    ConstellationTopologyNode,
    RealizedConstellationLayout,
    SkyComponent,
} from './constellationLayoutTypes'
import { describeComponent, packComponents } from './constellationPacking'
import { constellationRandom } from './constellationRandom'

export type {
    ConstellationTopologyNode,
    RealizedConstellationLayout,
} from './constellationLayoutTypes'
export interface ConstellationGenerationOptions {
    maxAttempts?: number
    forceFallback?: boolean
}

/** Resolves the entire private sky once; snapshots only project this immutable outcome. */
export function generateConstellationLayout(
    topology: readonly ConstellationTopologyNode[],
    seed: string,
    centerPath: ConstellationId,
    options: ConstellationGenerationOptions = {}
): RealizedConstellationLayout {
    const components = skyComponents(topology)
    const centerNodeId = `${centerPath}.root`
    const random = constellationRandom(seed)
    const maximum =
        options.forceFallback === true
            ? 0
            : Math.max(0, Math.min(32, Math.floor(options.maxAttempts ?? 32)))
    for (let attempt = 0; attempt < maximum; attempt += 1) {
        const positions = candidatePositions(
            components,
            centerNodeId,
            random,
            false
        )
        if (positions === undefined) {
            continue
        }
        const edges = constellationTopologyEdges(topology).filter(
            (edge) => edge.crossLink !== true
        )
        const rounded = roundedPositions(positions)
        if (constellationGeometryProblem(rounded, edges) === undefined) {
            return realizedLayout(
                topology,
                rounded,
                centerNodeId,
                attempt + 1,
                false
            )
        }
    }
    const fallback = candidatePositions(
        components,
        centerNodeId,
        constellationRandom(`${seed}:certified-fallback`),
        true
    )
    if (fallback === undefined) {
        throw new Error('Certified constellation packing failed')
    }
    const positions = roundedPositions(fallback)
    const edges = constellationTopologyEdges(topology).filter(
        (edge) => edge.crossLink !== true
    )
    const problem = constellationGeometryProblem(positions, edges)
    if (problem !== undefined) {
        throw new Error(`Invalid certified constellation template: ${problem}`)
    }
    return realizedLayout(topology, positions, centerNodeId, maximum, true)
}

function candidatePositions(
    components: SkyComponent[],
    centerNodeId: string,
    random: () => number,
    fallback: boolean
): Record<string, SkyPoint> | undefined {
    const transformed = []
    for (const component of components) {
        const positions = variedComponent(component, random, !fallback)
        if (
            !fallback &&
            constellationGeometryProblem(
                positions,
                component.edges.filter((edge) => edge.crossLink !== true)
            ) !== undefined
        ) {
            return undefined
        }
        transformed.push(describeComponent(positions))
    }
    return packComponents(transformed, centerNodeId, random, fallback)
}

function roundedPositions(
    positions: Record<string, SkyPoint>
): Record<string, SkyPoint> {
    const round = (value: number) => {
        const rounded = Math.round(value * 1000) / 1000
        return Object.is(rounded, -0) ? 0 : rounded
    }
    return Object.fromEntries(
        Object.entries(positions).map(([id, point]) => [
            id,
            { x: round(point.x), y: round(point.y) },
        ])
    )
}

function realizedLayout(
    topology: readonly ConstellationTopologyNode[],
    positions: Record<string, SkyPoint>,
    centerNodeId: string,
    attempts: number,
    usedFallback: boolean
): RealizedConstellationLayout {
    const regionIds = [...new Set(topology.map((node) => node.constellationId))]
    const regions = Object.fromEntries(
        regionIds.map((id) => [
            id,
            regionBounds(
                topology
                    .filter((node) => node.constellationId === id)
                    .map((node) => positions[node.id])
                    .filter((point): point is SkyPoint => point !== undefined)
            ),
        ])
    ) as Record<ConstellationId, ConstellationRegion>
    const radius =
        Math.ceil(
            (Math.max(
                ...Object.values(positions).flatMap((point) => [
                    Math.abs(point.x),
                    Math.abs(point.y),
                ])
            ) +
                140) /
                100
        ) * 100
    const layout: ConstellationLayoutSnapshot = {
        centerNodeId,
        bounds: {
            x: -radius,
            y: -radius,
            width: radius * 2,
            height: radius * 2,
        },
        minimumNodeSpacing: minimumSpacing(positions),
        regions,
    }
    const edges = constellationTopologyEdges(topology)
    const edgeWaypoints = routeConstellationCrossLinks(positions, edges)
    const problem = constellationGeometryProblem(
        positions,
        edges.map((edge) => ({
            ...edge,
            via: edgeWaypoints[`${edge.from}>${edge.to}`] ?? [],
        }))
    )
    if (problem !== undefined) {
        throw new Error(`Invalid routed constellation sky: ${problem}`)
    }
    return {
        layout,
        positions,
        crossLinks: edges
            .filter((edge) => edge.crossLink === true)
            .map((edge) => `${edge.from}>${edge.to}`),
        edgeWaypoints,
        diagnostics: { attempts, usedFallback },
    }
}

function minimumSpacing(positions: Record<string, SkyPoint>): number {
    const points = Object.values(positions)
    let squared = Infinity
    for (const [index, point] of points.entries()) {
        for (const other of points.slice(index + 1)) {
            squared = Math.min(squared, distanceSquared(point, other))
        }
    }
    return Math.floor(Math.sqrt(squared))
}

function regionBounds(points: SkyPoint[]): ConstellationRegion {
    const minX = Math.min(...points.map((point) => point.x)),
        maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y)),
        maxY = Math.max(...points.map((point) => point.y))
    const width = Math.max(320, maxX - minX + 160),
        height = Math.max(320, maxY - minY + 160)
    return {
        x: (minX + maxX - width) / 2,
        y: (minY + maxY - height) / 2,
        width,
        height,
    }
}
