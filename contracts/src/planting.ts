import type { WorldObjectBounds } from './environment'
import type { Vector2 } from './index'

export interface PlantTreePreviewCommand {
    type: 'plant_tree_preview'
    requestId: string
    position: Vector2
}

/** Private answer to the requesting connection; never included in public snapshots. */
export interface PlantTreePreview {
    type: 'plant_tree_preview'
    requestId: string
    locationId: string
    position: Vector2
    bounds: WorldObjectBounds
    available: boolean
    reason?: string
}
