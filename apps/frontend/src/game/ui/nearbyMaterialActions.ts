import type {
    AdventureResourceNode,
    CharacterSnapshot,
    FarmPlotSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { FARM_SOW_ENERGY, FARM_SOW_SEEDS } from '@my-game-ratata/contracts'

import { itemStackLabel } from '@/entities/items'
import { tGame } from '@/shared/lib/i18n'

import { interactionDistance, nearestByKind } from './interactionTargets'
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
                label: tGame('game.world.treeGrowing', {
                    seconds: Math.max(0, Math.ceil(((node.readyAt ?? now) - now) / 1000)),
                }),
                disabled: true,
                command,
            },
            { id: `gather:${node.id}`, label: tGame('game.world.cutWithoutLoot'), command },
        ]
    const labels = {
        herbs: tGame('game.world.gatherHerbs'),
        fiber: tGame('game.world.gatherFiber'),
        scrap: tGame('game.world.gatherMetal'),
        wood: tGame('game.world.gatherTimber'),
        grain: tGame('game.world.gatherGrain'),
        stone: tGame('game.world.gatherStone'),
        sapling: tGame('game.world.gatherSapling'),
        brushwood: tGame('game.world.gatherBrushwood'),
    }
    return [
        {
            id: `gather:${node.id}`,
            label:
                node.phase === 'stump'
                    ? tGame('game.world.removeStump')
                    : tGame('game.world.gatherMaterial', { material: labels[node.kind] }),
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
                  label: tGame('game.world.pickUp', { item: itemStackLabel(item) }),
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
                ? tGame('game.world.harvestWheat')
                : plot.phase === 'bare'
                  ? tGame('game.world.sowCost', {
                        required: String(FARM_SOW_SEEDS),
                        energy: String(sowEnergyCost),
                        seeds: String(seeds),
                        unavailable: unavailable === undefined ? '' : ` · ${unavailable}`,
                    })
                  : tGame('game.world.wheatGrowing', { seconds: String(seconds) }),
        disabled: plot.phase === 'growing' || (plot.phase === 'bare' && unavailable !== undefined),
        command: {
            type: 'farm_action',
            plotId: plot.id,
            action: plot.phase === 'ripe' ? 'harvest' : 'sow',
        },
    }
}

function sowUnavailable(player: CharacterSnapshot, seeds: number): string | undefined {
    if (seeds < FARM_SOW_SEEDS) return tGame('game.world.noSeeds')
    if (player.resourceChecks?.sow === 'energy') return tGame('game.world.notEnoughEnergy')
    return player.resourceChecks?.sow === 'ready' ? undefined : tGame('game.world.energyUnknown')
}
