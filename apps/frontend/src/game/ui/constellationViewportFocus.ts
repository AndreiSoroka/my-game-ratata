import type {
    ConstellationNodeSnapshot,
    ConstellationSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'
import type { Ref } from 'vue'

import { observedPathBounds } from './constellationFocusRegion'

interface FocusState {
    snapshot: () => ConstellationSnapshot
    dimensions: Readonly<Ref<{ width: number; height: number }>>
    minimumSpacing: Readonly<Ref<number>>
    baseScale: Readonly<Ref<number>>
    zoom: Ref<number>
    maximumZoom: Readonly<Ref<number>>
    centerOn: (point: Vector2) => void
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
        centerOn({ x: region.x + region.width / 2, y: region.y + region.height / 2 })
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
