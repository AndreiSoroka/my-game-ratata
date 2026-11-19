import { type FantasyBorderVariant, resolveFantasyBorder } from './borderVariants'

export interface FantasyBorderMetrics {
    /** Native nine-slice corner reserved by the border component. */
    cornerSize: number
    /** Artwork depth along a stretched straight edge, excluding corner ornaments. */
    edgeSize: number
}

// Measured from the source PNG's middle edge strips; all four sides are symmetric.
const deepEdges: Partial<Record<FantasyBorderVariant, number>> = {
    'border-000': 6,
    'border-003': 10,
    'border-004': 6,
    'border-008': 4,
    'border-009': 4,
    'border-014': 6,
    'border-024': 14,
}

/** Keep labels clear of rails without importing private artwork metadata. */
export function getFantasyBorderMetrics(border?: FantasyBorderVariant): FantasyBorderMetrics {
    const { key, slice } = resolveFantasyBorder(border)
    return { cornerSize: slice, edgeSize: deepEdges[key] ?? 2 }
}
