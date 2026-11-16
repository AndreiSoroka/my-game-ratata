import {
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    type ScenarioStep,
    type WorldChestSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { chestHasLineOfSight } from './chestInteraction'
import { type InventoryItemInstance, itemQuantity } from './inventory'
import type { GameRoom } from './room'
import { workingApproach } from './scenarioApproach'
import type { ScenarioOutcome } from './scenarioNavigation'
import { retryOutcome } from './scenarioRetries'
import type { ScenarioRuntime } from './scenarioState'
import { visibleScenarioTargets } from './scenarioTargets'

export function depositScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'deposit' }>,
    now: number
): ScenarioOutcome {
    const item = itemForDeposit(actor, run, step)
    if (item === undefined) {
        return { state: 'done' }
    }
    if (!chestLocationMatches(actor, step)) {
        return {
            state: 'blocked',
            reason: 'Выбранный сундук находится в другой локации.',
        }
    }
    const target = visibleScenarioTargets(
        actor,
        room,
        'chest',
        undefined,
        now
    ).find(
        (candidate) =>
            step.chestId === undefined || candidate.id === step.chestId
    )
    const chest = target?.chest
    if (target === undefined || chest === undefined) {
        return {
            state: 'blocked',
            reason: 'Выбранный сундук недоступен в области видимости.',
        }
    }
    if (!chestReached(actor, room, chest)) {
        return workingApproach(actor, run, room, target, now)
    }
    if (now - run.step.lastActionAt < 500) {
        return retryOutcome(run)
    }
    run.step.lastActionAt = now
    const opened = room.chestActions.handleResult(
        actor,
        { type: 'open_chest', chestId: chest.id },
        now
    )
    room.publishEvents(opened.events)
    if (!opened.accepted) {
        run.step.lastFailure = opened.error ?? 'Сундук открыть нельзя.'
        return retryOutcome(run)
    }
    const quantities = {
        all: itemQuantity(item),
        acquired: run.ledger.quantity(item),
    }
    const quantity = quantities[step.mode]
    const result = room.chestActions.handleResult(
        actor,
        {
            type: 'put_chest_item',
            chestId: chest.id,
            itemInstanceId: item.instanceId,
            quantity,
        },
        now
    )
    room.publishEvents(result.events)
    run.ledger.reconcile(actor.inventory)
    if (!result.accepted) {
        run.step.lastFailure = result.error ?? 'Не удалось переложить предмет.'
        return retryOutcome(run)
    }
    delete run.step.lastFailure
    return { state: 'progress' }
}

function itemForDeposit(
    actor: GameCharacter,
    run: ScenarioRuntime,
    step: Extract<ScenarioStep, { kind: 'deposit' }>
): InventoryItemInstance | undefined {
    return actor.inventory.find(
        (item) =>
            (step.itemIds.length === 0 || step.itemIds.includes(item.itemId)) &&
            (step.mode === 'all' || run.ledger.quantity(item) > 0)
    )
}

function chestLocationMatches(
    actor: GameCharacter,
    step: Extract<ScenarioStep, { kind: 'deposit' }>
): boolean {
    return step.locationId === undefined || step.locationId === actor.locationId
}

function chestReached(
    actor: GameCharacter,
    room: GameRoom,
    chest: WorldChestSnapshot
): boolean {
    return (
        chestInteractionDistance(
            actor.position,
            chest.position,
            chest.bounds
        ) <= CHEST_INTERACTION_RANGE &&
        chestHasLineOfSight(
            actor.position,
            chest.position,
            room.navigationFor(actor),
            CHEST_INTERACTION_RANGE + 1,
            chest.bounds
        )
    )
}
