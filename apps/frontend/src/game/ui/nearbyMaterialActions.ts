import type { CharacterSnapshot, FarmPlotSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import { FARM_SOW_ENERGY } from '@my-game-ratata/contracts'

import { interactionDistance, nearestByKind } from './interactionTargets'
import { itemStackLabel } from './itemLabels'
import type { InteractionAction } from './nearbyInteractionActions'

export function resourceActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    const labels = {
        herbs: 'травы',
        fiber: 'волокно',
        scrap: 'металл',
        wood: 'древесину',
        grain: 'зерно',
        stone: 'камень',
        sapling: 'саженец',
        brushwood: 'хворост',
    }
    return nearestByKind(
        (snapshot.adventure?.resourceNodes ?? []).filter(
            (node) => node.remaining > 0 && interactionDistance(player, node) <= 48
        ),
        (node) => node.kind,
        (node) => interactionDistance(player, node)
    ).map<InteractionAction>((node) => ({
        id: `gather:${node.id}`,
        label: `Собрать ${labels[node.kind]}`,
        command: { type: 'gather', nodeId: node.id },
    }))
}
export function pickupActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    const item = [...snapshot.items]
        .sort((a, b) => interactionDistance(player, a) - interactionDistance(player, b))
        .find((item) => interactionDistance(player, item) <= 24)
    return item
        ? [
              {
                  id: `pickup:${item.id}`,
                  label: `Подобрать: ${itemStackLabel(item)}`,
                  command: { type: 'pickup_item', worldItemId: item.id },
              },
          ]
        : []
}
export function farmAction(
    plot: FarmPlotSnapshot,
    player: CharacterSnapshot,
    now: number
): InteractionAction {
    const seconds = Math.max(0, Math.ceil((plot.readyAt - now) / 1000))
    return {
        id: `farm:${plot.id}:${plot.phase === 'ripe' ? 'harvest' : 'sow'}`,
        label:
            plot.phase === 'ripe'
                ? 'Собрать пшеницу · +3 зерна'
                : plot.phase === 'bare'
                  ? 'Посеять пшеницу · 5 EN'
                  : `Пшеница растёт · ${String(seconds)} сек.`,
        disabled:
            plot.phase === 'growing' ||
            (plot.phase === 'bare' && player.resources.energy < FARM_SOW_ENERGY),
        command: {
            type: 'farm_action',
            plotId: plot.id,
            action: plot.phase === 'ripe' ? 'harvest' : 'sow',
        },
    }
}
