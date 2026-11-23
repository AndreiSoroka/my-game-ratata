import {
    ABILITY_DEFINITIONS,
    type AshRiteId,
    type CharacterSnapshot,
    type ClientMessage,
    SKELETON_ORDER_LABELS,
    skeletonOrders,
    type WorldChestSnapshot,
} from '@my-game-ratata/contracts'

import { abilityName, tGame } from '@/shared/lib/i18n'

import { relation } from './combatTargeting'
import { interactionDistance } from './interactionTargets'
import type { InteractionAction } from './nearbyInteractionActions'

export function ashCharacterActions(
    player: CharacterSnapshot,
    target: CharacterSnapshot
): InteractionAction[] {
    if (!canSelectAshSkeleton(player, target)) return []
    const known = player.abilities?.known ?? []
    const distance = interactionDistance(player, target)
    const actions: InteractionAction[] = []
    if (distance <= ABILITY_DEFINITIONS.ash_order.range && known.includes('ash_order')) {
        actions.push(
            ...skeletonOrders.map((order): InteractionAction => ({
                id: `ash_order:${target.id}:${order}`,
                label: SKELETON_ORDER_LABELS[order],
                command: {
                    type: 'use_ability',
                    abilityId: 'ash_order',
                    targetId: target.id,
                    order,
                },
            }))
        )
    }
    for (const abilityId of ['ash_gift', 'ash_sacrifice'] as const) {
        if (distance <= ABILITY_DEFINITIONS[abilityId].range && known.includes(abilityId)) {
            actions.push(riteAction(abilityId, target.id))
        }
    }
    return actions
}

export function canSelectAshSkeleton(
    player: CharacterSnapshot,
    target: CharacterSnapshot | undefined
): boolean {
    return (
        target !== undefined &&
        target.alive &&
        target.archetype === 'skeleton' &&
        target.controllerKind === 'mob1' &&
        target.soul?.controlSource === 'script' &&
        relation(target, player) === 'friendly'
    )
}

export function ashChestActions(
    player: CharacterSnapshot,
    chest: WorldChestSnapshot
): InteractionAction[] {
    const known = player.abilities?.known ?? []
    if (chest.raisable && known.includes('ash_raise')) {
        return [riteAction('ash_raise', chest.id)]
    }
    if ((chest.kind === undefined || chest.kind === 'chest') && known.includes('ash_heart')) {
        return [riteAction('ash_heart', chest.id)]
    }
    return []
}

function riteAction(
    abilityId: Exclude<AshRiteId, 'ash_order'>,
    targetId: string
): InteractionAction {
    return {
        id: `${abilityId}:${targetId}`,
        label: abilityName(abilityId),
        command: { type: 'use_ability', abilityId, targetId },
    }
}

export function ashHotbarReason(
    abilityId: AshRiteId,
    player: CharacterSnapshot,
    target: CharacterSnapshot | undefined
): string | undefined {
    if (abilityId !== 'ash_gift' && abilityId !== 'ash_sacrifice')
        return tGame('game.world.selectAndUseF')
    return canSelectAshSkeleton(player, target)
        ? undefined
        : tGame('game.world.selectAlliedSkeleton')
}

export function ashHotbarCommand(
    abilityId: AshRiteId,
    target: CharacterSnapshot | undefined
): ClientMessage | undefined {
    if (target === undefined || (abilityId !== 'ash_gift' && abilityId !== 'ash_sacrifice'))
        return undefined
    return { type: 'use_ability', abilityId, targetId: target.id }
}
