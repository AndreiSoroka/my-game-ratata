import {
    type AdventureResourceNode,
    type GameEventPayload,
    type GatherOperation,
    ITEM_DEFINITIONS,
    TREE_PROFILES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import {
    deplete,
    gatheringTool,
    harvestOutputs,
    operationMatches,
    removeNode,
} from './harvestRules'
import {
    addInventoryItems,
    canAddInventoryItems,
    createItemInstance,
    type InventoryItemInstance,
} from './inventory'
import { resetMartyrStreak } from './martyr'
export { STONE_REGROW_MS, stumpBounds, TREE_GROW_MS } from './harvestRules'

import { wearItem } from './itemDurability'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { resourceApproach, resourceReachable } from './resourcePlacement'
import { recordUsefulResourceSpend } from './resourcePractice'
import { canPerformSkillAction } from './skillProgression'

const workLocks = new WeakMap<GameCharacter, number>()
export interface GatherInspection {
    status: 'ready' | 'range' | 'cooldown' | 'stop'
    target?: Vector2
    reason?: string
}
export interface HarvestDrops {
    random: () => number
    drop: (
        actor: GameCharacter,
        item: InventoryItemInstance,
        node: AdventureResourceNode
    ) => void
}
export function workReady(
    actor: GameCharacter,
    state: PlayerAdventure,
    now: number
): boolean {
    return canPerformSkillAction(actor, now) && now >= state.gatherAllowedAt
}
export function inspectGather(
    actor: GameCharacter,
    state: PlayerAdventure,
    node: AdventureResourceNode,
    operation: GatherOperation,
    now: number,
    navigation?: NavigationService
): GatherInspection {
    const stop = (reason: string): GatherInspection => ({
        status: 'stop',
        reason,
    })
    if (
        !gatherActorAvailable(actor, node, now) ||
        navigation === undefined ||
        node.bounds === undefined
    ) {
        return stop('Сейчас работать с этим ресурсом нельзя.')
    }
    if (!operationMatches(node, operation)) {
        return stop('Этот источник уже изменился или исчерпан.')
    }
    const work = gatheringTool(actor, node, operation)
    if (work === undefined) {
        return stop(
            operation === 'clear_stump'
                ? 'Нужен исправный топор в руке.'
                : 'Нужен исправный подходящий инструмент в руке.'
        )
    }
    if (actor.energy < work.energy) {
        return stop(`Для работы нужно ${String(work.energy)} сил.`)
    }
    if (
        !canAddInventoryItems(actor.inventory, harvestOutputs(node, operation))
    ) {
        return stop(
            'В рюкзаке нет места для всей добычи. Ресурс и инструмент сохранены.'
        )
    }
    if (resourceReachable(actor, node.bounds, navigation)) {
        return gatherCoolingDown(actor, state, now)
            ? { status: 'cooldown' }
            : { status: 'ready' }
    }
    const target = resourceApproach(actor, node.bounds, navigation, 240)
    return target === undefined
        ? stop('Ресурс не виден или к нему нет подхода.')
        : { status: 'range', target }
}
export function resolveGather(
    actor: GameCharacter,
    state: PlayerAdventure,
    node: AdventureResourceNode,
    now: number,
    navigation?: NavigationService,
    drops?: HarvestDrops,
    operation: GatherOperation = 'harvest'
): GameEventPayload[] {
    const check = inspectGather(actor, state, node, operation, now, navigation)
    if (check.status !== 'ready') {
        return rejectWork(
            state,
            check.reason ?? 'Подойди к ресурсу или дождись следующего удара.'
        )
    }
    const work = gatheringTool(actor, node, operation)
    if (work === undefined) {
        return []
    }
    const outputs = harvestOutputs(node, operation)
    if (!addInventoryItems(actor.inventory, outputs)) {
        return rejectWork(state, 'В рюкзаке нет места для всей добычи.')
    }
    resetMartyrStreak(actor)
    recordUsefulResourceSpend(actor, 'energy', actor.drainEnergy(work.energy))
    workAnimation(actor, state, now, work.duration)
    const broken =
        work.tool === undefined ? false : wearItem(work.tool, work.wear)
    const treeCut = node.source === 'tree' && operation === 'harvest'
    if (operation === 'harvest') {
        node.remaining -= 1
        if (node.remaining === 0) {
            deplete(node, now)
        }
    } else {
        removeNode(node)
    }
    const text = setNotice(state, resultText(node, operation, outputs, broken))
    if (treeCut) {
        dropTreeLoot(actor, node, drops)
    }
    return outputs.length === 0
        ? [{ kind: 'notice', actorId: actor.id, text }]
        : outputs.map((item) => ({
              kind: 'resource_gather' as const,
              actorId: actor.id,
              itemId: item.itemId,
              amount: item.quantity ?? 1,
              text,
          }))
}
function dropTreeLoot(
    actor: GameCharacter,
    node: AdventureResourceNode,
    drops?: HarvestDrops
): void {
    if (node.treeProfile === undefined || drops === undefined) {
        return
    }
    for (const loot of TREE_PROFILES[node.treeProfile].sideDrops) {
        if (drops.random() < loot.chance) {
            drops.drop(
                actor,
                createItemInstance(loot.itemId, loot.quantity),
                node
            )
        }
    }
}
export function rejectWork(
    state: PlayerAdventure,
    text: string
): GameEventPayload[] {
    setNotice(state, text)
    return []
}
export function releaseWorkLock(actor: GameCharacter): void {
    if (actor.actionLockUntil === workLocks.get(actor)) {
        actor.actionLockUntil = 0
    }
    workLocks.delete(actor)
}
export function workAnimation(
    actor: GameCharacter,
    state: PlayerAdventure,
    now: number,
    duration: number
): void {
    state.gatherAllowedAt = now + duration
    actor.setMoveInput({ x: 0, y: 0 })
    actor.clearPath()
    const prior = actor.actionLockUntil
    actor.lockAction(now, duration)
    if (actor.actionLockUntil > prior) {
        workLocks.set(actor, actor.actionLockUntil)
    }
    actor.setAnimation('attack', now, 400)
}

function gatherActorAvailable(
    actor: GameCharacter,
    node: AdventureResourceNode,
    now: number
): boolean {
    return (
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.stunUntil <= now &&
        actor.locationId === node.locationId
    )
}
function resultText(
    node: AdventureResourceNode,
    operation: GatherOperation,
    outputs: InventoryItemInstance[],
    broken: boolean
): string {
    const reward =
        operation === 'cut_sapling'
            ? 'Саженец удалён без добычи.'
            : outputs
                  .map(
                      (item) =>
                          `${ITEM_DEFINITIONS[item.itemId].name} +${String(item.quantity ?? 1)}`
                  )
                  .join('. ') + '.'
    return `${reward}${node.phase === 'stump' ? ' Остался пень.' : ''}${broken ? ' Инструмент сломан — кузнец сможет починить.' : ''}`
}

function gatherCoolingDown(
    actor: GameCharacter,
    state: PlayerAdventure,
    now: number
): boolean {
    return now < state.gatherAllowedAt || actor.isActionLocked(now)
}
