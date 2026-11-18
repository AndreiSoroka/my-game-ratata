import type {
    ConstellationId,
    ConstellationLayoutSnapshot,
} from '@my-game-ratata/contracts'

import type { SkyEdge, SkyPoint } from './constellationGeometry'

export interface ConstellationTopologyNode {
    id: string
    constellationId: ConstellationId
    parents: readonly string[]
    kind?: 'root' | 'passive' | 'ability' | 'joint'
}
export interface RealizedConstellationLayout {
    layout: ConstellationLayoutSnapshot
    positions: Record<string, SkyPoint>
    edgeWaypoints: Record<string, SkyPoint[]>
    crossLinks: string[]
    diagnostics: { attempts: number; usedFallback: boolean }
}
export interface SkyBranch {
    anchor: string
    descendants: string[]
}
export interface SkyComponent {
    ids: string[]
    edges: SkyEdge[]
    positions: Record<string, SkyPoint>
    branches: SkyBranch[]
}
export interface PlacedSkyComponent {
    ids: string[]
    positions: Record<string, SkyPoint>
    circle: { x: number; y: number; radius: number }
}
