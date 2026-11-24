import {
    nearestInteractionPoint,
    type Vector2,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import {
    isWorldTargetEligible,
    worldSelectionRange,
    type WorldSelectionTarget,
    worldTargetCandidates,
} from '../ui/worldTargetSelection'
import { selectionIntersectsViewport } from './selectionViewport'

export interface RuntimeSelectionContext {
    snapshot: WorldSnapshot | undefined
    playerId: string | undefined
    tileSize: number
    viewport: { left: number; top: number; right: number; bottom: number } | undefined
    positionVisible: (position: Vector2) => boolean
    characterVisible: (id: string) => boolean
    characterPosition?: (id: string) => Vector2 | undefined
}

export function runtimeSelectionVisible(
    target: WorldSelectionTarget,
    context: RuntimeSelectionContext
): boolean {
    const viewport = context.viewport
    const position =
        target.kind === 'character' ? context.characterPosition?.(target.id) : undefined
    const displayed = position ? { ...target, position } : target
    if (!viewport || !selectionIntersectsViewport(displayed, viewport)) return false
    if (target.kind === 'character') return context.characterVisible(target.id)
    if (target.interactionAreas?.length) {
        const player = context.snapshot?.characters.find((actor) => actor.id === context.playerId)
        return target.interactionAreas.some(
            (area) =>
                selectionIntersectsViewport({ ...target, interactionAreas: [area] }, viewport) &&
                context.positionVisible(
                    nearestInteractionPoint(player?.position ?? target.position, [area])
                )
        )
    }
    return context.positionVisible(target.position)
}

export function runtimeCanSelect(key: string, context: RuntimeSelectionContext): boolean {
    const { snapshot, playerId, tileSize } = context
    const player = snapshot?.characters.find((actor) => actor.id === playerId)
    if (!snapshot || !player) return false
    const candidate = worldTargetCandidates(snapshot, player).find((target) => target.key === key)
    return (
        candidate !== undefined &&
        isWorldTargetEligible(candidate, player, worldSelectionRange(player, tileSize), (target) =>
            runtimeSelectionVisible(target, context)
        )
    )
}
