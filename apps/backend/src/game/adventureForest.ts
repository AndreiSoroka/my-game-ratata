import type { GatherOperation, Vector2 } from '@my-game-ratata/contracts'

import type { AdventureResources } from './adventureResources'
import type {
    ResourcePriority,
    ResourceTieBreak,
} from './adventureResourceSelection'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'

export function createAdventureForest(
    resources: () => AdventureResources,
    stateFor: (actor: GameCharacter) => PlayerAdventure
) {
    return {
        resourceSnapshot: (locationId: string, nodeId?: string) =>
            resources().snapshot(locationId, nodeId),
        selectResourceSnapshot: (
            priority: ResourcePriority,
            tieBreak: ResourceTieBreak
        ) => resources().selectSnapshot(priority, tieBreak),
        farmSnapshot: (locationId: string, now: number) =>
            resources().snapshotFarms(locationId, now),
        inspectGather: (
            actor: GameCharacter,
            nodeId: string,
            operation: GatherOperation,
            now: number,
            navigation: NavigationService
        ) =>
            resources().inspectGather(
                actor,
                stateFor(actor),
                nodeId,
                operation,
                now,
                navigation
            ),
        previewPlant: (
            actor: GameCharacter,
            position: Vector2,
            navigation: NavigationService
        ) => resources().previewPlant(actor, position, navigation),
        workAvailableAt: (actor: GameCharacter) =>
            stateFor(actor).gatherAllowedAt,
        reportWorkProblem: (actor: GameCharacter, reason: string): void => {
            setNotice(stateFor(actor), reason)
        },
    }
}
