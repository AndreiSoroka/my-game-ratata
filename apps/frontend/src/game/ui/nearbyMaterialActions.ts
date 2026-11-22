import type {
    AdventureResourceNode,
    CharacterSnapshot,
    FarmPlotSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { FARM_SOW_ENERGY, FARM_SOW_SEEDS } from '@my-game-ratata/contracts'

import { interactionDistance, nearestByKind } from './interactionTargets'
import { itemStackLabel } from './itemLabels'
import type { InteractionAction } from './nearbyInteractionActions'

export function resourceActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    return nearestByKind(
        (snapshot.adventure?.resourceNodes ?? []).filter(
            (node) =>
                node.phase !== 'removed' &&
                node.phase !== 'depleted' &&
                (node.remaining > 0 || node.phase === 'stump' || node.phase === 'growing') &&
                interactionDistance(player, node) <= 48
        ),
        (node) => `${node.kind}:${node.phase ?? 'ready'}`,
        (node) => interactionDistance(player, node)
    ).flatMap((node) => forestResourceActions(node, snapshot.serverTime))
}
export function forestResourceActions(
    node: AdventureResourceNode,
    now: number
): InteractionAction[] {
    const operation =
        node.phase === 'stump'
            ? 'clear_stump'
            : node.phase === 'growing'
              ? 'cut_sapling'
              : 'harvest'
    const command: InteractionAction['command'] = {
        type: 'auto_action',
        action: { kind: 'gather', nodeId: node.id, operation },
    }
    if (node.phase === 'growing')
        return [
            {
                id: `growth:${node.id}`,
                label: `Дерево растёт · ${Math.max(0, Math.ceil(((node.readyAt ?? now) - now) / 1000))} сек.`,
                disabled: true,
                command,
            },
            { id: `gather:${node.id}`, label: 'Срубить без добычи', command },
        ]
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
    return [
        {
            id: `gather:${node.id}`,
            label:
                node.phase === 'stump'
                    ? 'Убрать пень · +1 древесина'
                    : `Собрать ${labels[node.kind]}`,
            command,
        },
    ]
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
    const seeds = player.inventory.reduce(
        (total, item) => total + (item.itemId === 'wheat_seed' ? (item.quantity ?? 1) : 0),
        0
    )
    const unavailable = sowUnavailable(player, seeds)
    const sowEnergyCost = player.resourceChecks?.sowEnergyCost ?? FARM_SOW_ENERGY
    return {
        id: `farm:${plot.id}:${plot.phase === 'ripe' ? 'harvest' : 'sow'}`,
        label:
            plot.phase === 'ripe'
                ? 'Собрать пшеницу · +3 зерна'
                : plot.phase === 'bare'
                  ? `Посеять · ${String(FARM_SOW_SEEDS)} семя · ${String(sowEnergyCost)} EN · в рюкзаке: ${String(seeds)}${unavailable === undefined ? '' : ` · ${unavailable}`}`
                  : `Пшеница растёт · ${String(seconds)} сек.`,
        disabled: plot.phase === 'growing' || (plot.phase === 'bare' && unavailable !== undefined),
        command: {
            type: 'farm_action',
            plotId: plot.id,
            action: plot.phase === 'ripe' ? 'harvest' : 'sow',
        },
    }
}

function sowUnavailable(player: CharacterSnapshot, seeds: number): string | undefined {
    if (seeds < FARM_SOW_SEEDS) return 'нет семян'
    if (player.resourceChecks?.sow === 'energy') return 'недостаточно сил'
    return player.resourceChecks?.sow === 'ready' ? undefined : 'нет данных о силах'
}
