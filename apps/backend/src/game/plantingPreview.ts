import type {
    PlantTreePreview,
    PlantTreePreviewCommand,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'

const requests = new WeakMap<GameCharacter, number[]>()
/** Sliding window prevents bursts across fixed-second boundaries. */
export function plantingPreview(
    actor: GameCharacter,
    command: PlantTreePreviewCommand,
    service: AdventureService,
    navigation: NavigationService,
    now: number
): PlantTreePreview | undefined {
    const recent = (requests.get(actor) ?? []).filter(
        (time) => now - time < 1000
    )
    if (recent.length >= 10) {
        return undefined
    }
    recent.push(now)
    requests.set(actor, recent)
    const preview = service.previewPlant(actor, command.position, navigation)
    return {
        type: 'plant_tree_preview',
        requestId: command.requestId,
        locationId: actor.locationId,
        position: preview.position,
        bounds: preview.bounds,
        available:
            preview.available &&
            actor.alive &&
            !actor.tags.has('state.retired'),
        ...(preview.reason === undefined ? {} : { reason: preview.reason }),
    }
}
