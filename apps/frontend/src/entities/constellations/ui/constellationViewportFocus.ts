import type {
    ConstellationNodeSnapshot,
    ConstellationRegion,
    ConstellationSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'
import type { Ref } from 'vue'

import { projectConstellationStars } from '../model/constellationParallax'
import { observedPathBounds } from './constellationFocusRegion'

interface FocusState {
    snapshot: () => ConstellationSnapshot
    dimensions: Readonly<Ref<{ width: number; height: number }>>
    minimumSpacing: Readonly<Ref<number>>
    baseScale: Readonly<Ref<number>>
    zoom: Ref<number>
    maximumZoom: Readonly<Ref<number>>
    centerOn: (point: Vector2) => Vector2
}

/** Path inspection fits earned content; individual star inspection retains the readable close-up. */
export function constellationViewportFocus(state: FocusState) {
    const { snapshot, dimensions, minimumSpacing, baseScale, zoom, maximumZoom, centerOn } = state
    function focusPath(node: ConstellationNodeSnapshot): void {
        const region = observedPathBounds(snapshot(), node.constellationId)
        if (!region) {
            focusStar(node)
            return
        }
        const padding = 36
        const fitScale = Math.max(
            1,
            region.width / Math.max(1, dimensions.value.width - padding * 2),
            region.height / Math.max(1, dimensions.value.height - padding * 2)
        )
        zoom.value = Math.max(1, Math.min(maximumZoom.value, baseScale.value / fitScale))
        fitProjectedPath(state, node, region, padding)
    }
    function focusStar(node: ConstellationNodeSnapshot): void {
        const region = snapshot().layout?.regions[node.constellationId]
        const fitScale = region
            ? Math.max(
                  region.width / dimensions.value.width,
                  region.height / dimensions.value.height
              )
            : baseScale.value / 2
        const desiredScale = Math.min(fitScale, minimumSpacing.value / 64)
        zoom.value = Math.min(maximumZoom.value, baseScale.value / desiredScale)
        centerOn(node)
    }
    return { focusPath, focusStar }
}

/** Fit received local geometry at its real camera position, including map-edge clamps. */
function fitProjectedPath(
    state: FocusState,
    node: ConstellationNodeSnapshot,
    region: ConstellationRegion,
    padding: number
): void {
    const snapshot = state.snapshot()
    const nodes = snapshot.nodes.filter((entry) => entry.constellationId === node.constellationId)
    const ids = new Set(nodes.map((entry) => entry.id))
    const path = {
        ...snapshot,
        nodes,
        edges: snapshot.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    }
    let center = state.centerOn({ x: region.x + region.width / 2, y: region.y + region.height / 2 })
    const projectedRegion = () =>
        observedPathBounds(
            projectConstellationStars(path, {
                center,
                zoom: state.zoom.value,
            }),
            node.constellationId
        )!
    // Center the received projected geometry while retaining the authored readable fit.
    for (let iteration = 0; iteration < 8; iteration++) {
        const projected = projectedRegion()
        center = state.centerOn({
            x: projected.x + projected.width / 2,
            y: projected.y + projected.height / 2,
        })
    }
    const fits = (zoom: number) => {
        state.zoom.value = zoom
        const projected = projectedRegion()
        const scale = state.baseScale.value / zoom
        const halfWidth = (Math.max(1, state.dimensions.value.width - padding * 2) * scale) / 2
        const halfHeight = (Math.max(1, state.dimensions.value.height - padding * 2) * scale) / 2
        return (
            projected.x >= center.x - halfWidth &&
            projected.x + projected.width <= center.x + halfWidth &&
            projected.y >= center.y - halfHeight &&
            projected.y + projected.height <= center.y + halfHeight
        )
    }
    let upper = state.zoom.value
    if (fits(upper) || !fits(1)) return
    let lower = 1
    // Keep a verified fitting lower bound; no unbounded settling or enlarged universal margin.
    for (let iteration = 0; iteration < 8; iteration++) {
        const candidate = (lower + upper) / 2
        if (fits(candidate)) lower = candidate
        else upper = candidate
    }
    state.zoom.value = lower
}
