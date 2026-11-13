import {
    type CharacterSnapshot,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    type Vector2,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { InteractionAction } from './nearbyInteractionActions'

export function chestActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    isVisible: (position: Vector2) => boolean = () => true
): InteractionAction[] {
    if (!player.alive) return []
    const chest = snapshot.chests
        .filter((item) => isVisible(item.position))
        .map((item) => ({
            item,
            distance: chestInteractionDistance(player.position, item.position),
        }))
        .filter((candidate) => candidate.distance <= CHEST_INTERACTION_RANGE)
        .sort((a, b) => a.distance - b.distance)[0]?.item
    return chest
        ? [
              {
                  id: `chest:${chest.id}`,
                  label:
                      chest.kind === 'corpse'
                          ? `Обыскать: ${chest.title?.replace(/^Тело: /, '') ?? 'тело'}`
                          : 'Открыть сундук',
                  command: { type: 'open_chest', chestId: chest.id },
              },
          ]
        : []
}
