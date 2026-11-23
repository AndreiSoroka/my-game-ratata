import {
    type CharacterSnapshot,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    type Vector2,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import { ashChestActions } from './ashActions'
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
            distance: chestInteractionDistance(player.position, item.position, item.bounds),
        }))
        .filter((candidate) => candidate.distance <= CHEST_INTERACTION_RANGE)
        .sort((a, b) => a.distance - b.distance)[0]?.item
    return chest
        ? [
              ...(!chest.ashOnly
                  ? [
                        {
                            id: `chest:${chest.id}`,
                            label:
                                chest.kind === 'corpse'
                                    ? tGame('game.world.searchBody', {
                                          name:
                                              chest.title?.replace(/^Тело: /, '') ??
                                              tGame('game.world.bodyLower'),
                                      })
                                    : chest.kind === 'barrel'
                                      ? tGame('game.world.openBarrel')
                                      : tGame('game.world.openChest'),
                            command: { type: 'open_chest' as const, chestId: chest.id },
                        },
                    ]
                  : []),
              ...ashChestActions(player, chest),
          ]
        : []
}
