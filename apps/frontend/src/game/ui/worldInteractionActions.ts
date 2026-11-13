import type {
    CharacterSnapshot,
    Vector2,
    WorldObjectSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import { distanceToBounds, nearestByKind } from './interactionTargets'
import type { InteractionAction } from './nearbyInteractionActions'

export function worldInteractionActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    isVisible: (position: Vector2) => boolean = () => true
): InteractionAction[] {
    const distance = (target: WorldObjectSnapshot) =>
        distanceToBounds(player.position, target.bounds)
    const objects = (snapshot.adventure?.worldObjects ?? []).filter(
        (target) => distance(target) <= 48 && isVisible(target.position)
    )
    const labels = { sign: 'Прочитать', barrel: 'Осмотреть', water: 'Попить' }
    return nearestByKind(objects, (target) => target.kind, distance).map((target) => ({
        id: `world:${target.id}`,
        label: `${labels[target.kind]}: ${target.name}`,
        command: { type: 'world_interact', objectId: target.id },
    }))
}
