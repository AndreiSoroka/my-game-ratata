import type {
    CharacterSnapshot,
    Vector2,
    WorldObjectSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import { tGame, tLocalized } from '@/shared/lib/i18n'

import { nearestByKind, targetInteractionDistance } from './interactionTargets'
import type { InteractionAction } from './nearbyInteractionActions'

export function worldInteractionActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    isVisible: (position: Vector2) => boolean = () => true
): InteractionAction[] {
    const distance = (target: WorldObjectSnapshot) =>
        targetInteractionDistance(player.position, target)
    const objects = (snapshot.adventure?.worldObjects ?? []).filter(
        (target) =>
            target.kind !== 'barrel' &&
            (target.kind !== 'bell' || target.bell?.state === 'prepared') &&
            distance(target) <= 48 &&
            isVisible(target.position)
    )
    const labels = {
        sign: tGame('game.world.read'),
        barrel: tGame('game.world.inspect'),
        water: tGame('game.world.drink'),
        bell: tGame('game.world.awaken'),
    }
    return nearestByKind(objects, (target) => target.kind, distance).map((target) => ({
        id: `world:${target.id}`,
        label: `${labels[target.kind]}: ${tLocalized(target.nameMessage, target.name)}`,
        command: { type: 'world_interact', objectId: target.id },
    }))
}
