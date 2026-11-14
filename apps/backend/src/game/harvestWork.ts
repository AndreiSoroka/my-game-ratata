import {
    type AdventureResourceNode,
    type GameEventPayload,
    isItemBroken,
    ITEM_DEFINITIONS,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import {
    addInventoryItems,
    createItemInstance,
    type InventoryItemInstance,
} from './inventory'
import { wearItem } from './itemDurability'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { resourceReachable } from './resourcePlacement'
import { canPerformSkillAction } from './skillProgression'

export const TREE_GROW_MS = 10 * 60_000
export const STONE_REGROW_MS = 20 * 60_000

interface WorkTool {
    tool: InventoryItemInstance
    energy: number
    duration: number
    wear: number
}

export function workReady(
    actor: GameCharacter,
    state: PlayerAdventure,
    now: number
): boolean {
    return canPerformSkillAction(actor, now) && now >= state.gatherAllowedAt
}

export function resolveGather(
    actor: GameCharacter,
    state: PlayerAdventure,
    node: AdventureResourceNode,
    now: number,
    navigation?: NavigationService
): GameEventPayload[] {
    const problem = gatherProblem(actor, state, node, now, navigation)
    if (problem !== undefined) {
        return rejectWork(state, problem)
    }
    const work = gatheringTool(actor, node)
    if (work === undefined) {
        return rejectWork(
            state,
            node.source === 'tree'
                ? 'Нужен исправный топор или меч в руке.'
                : 'Нужна исправная кирка в руке.'
        )
    }
    if (actor.energy < work.energy) {
        return rejectWork(state, `Для работы нужно ${String(work.energy)} сил.`)
    }
    const finalTree = node.source === 'tree' && node.remaining === 1
    const outputs = [createItemInstance(node.kind)]
    if (finalTree) {
        outputs.push(createItemInstance('sapling', 2))
    }
    if (!addInventoryItems(actor.inventory, outputs)) {
        return rejectWork(
            state,
            'В рюкзаке нет места для всей добычи. Ресурс и инструмент сохранены.'
        )
    }
    actor.drainEnergy(work.energy)
    workAnimation(actor, state, now, work.duration)
    const broken = wearItem(work.tool, work.wear)
    node.remaining -= 1
    if (node.remaining === 0) {
        deplete(node, now)
    }
    const text = setNotice(state, resultText(node, finalTree, broken))
    return [
        {
            kind: 'resource_gather',
            actorId: actor.id,
            itemId: node.kind,
            amount: 1,
            text,
        },
    ]
}

function gatherProblem(
    actor: GameCharacter,
    state: PlayerAdventure,
    node: AdventureResourceNode,
    now: number,
    navigation?: NavigationService
): string | undefined {
    if (
        !workReady(actor, state, now) ||
        actor.locationId !== node.locationId ||
        navigation === undefined ||
        node.bounds === undefined ||
        !resourceReachable(actor, node.bounds, navigation)
    ) {
        return 'Подойди к ресурсу: работать через стену или во время другого действия нельзя.'
    }
    if (node.phase !== 'ready' || node.remaining <= 0) {
        return node.source === 'tree'
            ? 'Здесь пень или молодое дерево. Посади саженец и дай ему вырасти.'
            : 'Камень исчерпан; залежь восстановится через 20 минут.'
    }
    return undefined
}

function gatheringTool(
    actor: GameCharacter,
    node: AdventureResourceNode
): WorkTool | undefined {
    const tool = actor.equipment.weapon
    if (tool === undefined || isItemBroken(tool)) {
        return undefined
    }
    const capability =
        node.source === undefined
            ? undefined
            : ITEM_DEFINITIONS[tool.itemId].gathering?.[node.source]
    return capability === undefined
        ? undefined
        : {
              tool,
              energy: capability.energy,
              duration: capability.durationMs,
              wear: capability.wear,
          }
}

function deplete(node: AdventureResourceNode, now: number): void {
    node.phase = node.source === 'tree' ? 'stump' : 'depleted'
    node.readyAt = node.source === 'stone' ? now + STONE_REGROW_MS : 0
    if (node.source === 'tree') {
        node.collisionBounds = stumpBounds(node.position)
    } else {
        delete node.collisionBounds
    }
}

function resultText(
    node: AdventureResourceNode,
    finalTree: boolean,
    broken: boolean
): string {
    return `${node.source === 'tree' ? 'Древесина' : 'Камень'} +1.${finalTree ? ' Дерево стало пнём; саженцы +2.' : ''}${broken ? ' Инструмент сломан — кузнец сможет починить.' : ''}`
}

export function stumpBounds(position: Vector2): WorldObjectBounds {
    return { x: position.x - 8, y: position.y - 8, width: 16, height: 16 }
}

export function rejectWork(
    state: PlayerAdventure,
    text: string
): GameEventPayload[] {
    setNotice(state, text)
    return []
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
    actor.lockAction(now, duration)
    actor.setAnimation('attack', now, 400)
}
