import type { ConstellationId } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveMaxEnergy, effectiveMaxMana } from './effectiveResources'
import { canTargetByFaction } from './factions'
import {
    recordLifeEnergyRecovery,
    recordLifeEnergySpend,
} from './vitalityPractice'

export type PracticeResource = 'mana' | 'energy'

/** A paid loss remains recoverable only until some real recovery consumes it. */
export interface ResourceSpendReceipt {
    resource: PracticeResource
    paid: number
    remaining: number
    useful: boolean
    lifeSource?: 'work' | 'combat'
    recoveredBeforeConfirmation: number
}

export function createResourcePractice(): Record<
    PracticeResource,
    ResourceSpendReceipt[]
> {
    return { mana: [], energy: [] }
}

function missingResource(
    actor: GameCharacter,
    resource: PracticeResource
): number {
    const maximum =
        resource === 'mana'
            ? effectiveMaxMana(actor)
            : effectiveMaxEnergy(actor)
    return Math.max(0, maximum - actor[resource])
}

/** Reconcile ordinary drains too; they never become useful merely by existing. */
function reconcile(
    actor: GameCharacter,
    resource: PracticeResource,
    missing: number
): ResourceSpendReceipt[] {
    const losses = actor.resourcePractice[resource]
    const tracked = losses.reduce((sum, loss) => sum + loss.remaining, 0)
    let recovered = Math.max(0, tracked - missing)
    for (const loss of losses) {
        const amount = Math.min(loss.remaining, recovered)
        loss.remaining -= amount
        recovered -= amount
    }
    actor.resourcePractice[resource] = losses.filter(
        (loss) => loss.remaining > 0
    )
    if (missing > tracked) {
        actor.resourcePractice[resource].push({
            resource,
            paid: 0,
            remaining: missing - tracked,
            useful: false,
            recoveredBeforeConfirmation: 0,
        })
    }
    return actor.resourcePractice[resource]
}

/** A capacity change consumes neither resources nor recovery practice. */
export function reconcileResourceCapacity(
    actor: GameCharacter,
    resource: PracticeResource
): void {
    reconcile(actor, resource, missingResource(actor, resource))
}

/** Call after payment, then confirm only after its meaningful outcome resolves. */
export function recordResourceSpend(
    actor: GameCharacter,
    resource: PracticeResource,
    amount: number
): ResourceSpendReceipt | undefined {
    if (
        !actor.alive ||
        actor.trainingTarget !== undefined ||
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return undefined
    }
    const missing = missingResource(actor, resource)
    const recoverable = Math.min(amount, missing)
    const losses = reconcile(
        actor,
        resource,
        Math.max(0, missing - recoverable)
    )
    const receipt = {
        resource,
        paid: amount,
        remaining: recoverable,
        useful: false,
        recoveredBeforeConfirmation: 0,
    }
    if (recoverable > 0) {
        losses.push(receipt)
    }
    return receipt
}

export function confirmResourceSpend(
    receipt: ResourceSpendReceipt | undefined
): void {
    if (receipt !== undefined) {
        receipt.useful = true
    }
}

export function confirmCombatResourceSpend(
    actor: GameCharacter,
    target: GameCharacter,
    result: { trainableDamage: number; absorbed: number },
    receipts: ReadonlyArray<ResourceSpendReceipt | undefined>,
    now: number
): void {
    if (
        result.trainableDamage > 0 ||
        (result.absorbed > 0 &&
            target.trainingTarget === undefined &&
            actor.faction !== target.faction &&
            canTargetByFaction(actor, target, now))
    ) {
        for (const receipt of receipts) {
            confirmResourceSpend(receipt)
            confirmLifeSpend(actor, receipt, 'combat', now)
        }
    }
}

function confirmLifeSpend(
    actor: GameCharacter,
    receipt: ResourceSpendReceipt | undefined,
    source: NonNullable<ResourceSpendReceipt['lifeSource']>,
    now: number
): void {
    if (
        receipt?.resource !== 'energy' ||
        receipt.paid <= 0 ||
        receipt.lifeSource !== undefined ||
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired')
    ) {
        return
    }
    receipt.lifeSource = source
    recordLifeEnergySpend(actor, receipt.paid, now)
    // A paid attack can finish after natural recovery has already restored some of its cost.
    recordLifeEnergyRecovery(actor, 0, receipt.recoveredBeforeConfirmation, now)
}

export function recordLifeWorkSpend(
    actor: GameCharacter,
    amount: number,
    now: number
): void {
    const receipt = recordResourceSpend(actor, 'energy', amount)
    confirmResourceSpend(receipt)
    confirmLifeSpend(actor, receipt, 'work', now)
}

export function recordUsefulResourceSpend(
    actor: GameCharacter,
    resource: PracticeResource,
    amount: number
): void {
    confirmResourceSpend(recordResourceSpend(actor, resource, amount))
}

export function spendUsefulEnergy(actor: GameCharacter, amount: number): void {
    recordUsefulResourceSpend(actor, 'energy', actor.drainEnergy(amount))
}

export function recordPaidResources(
    actor: GameCharacter,
    before: Record<PracticeResource, number>
): ResourceSpendReceipt[] {
    return (['mana', 'energy'] as const).flatMap((resource) => {
        const receipt = recordResourceSpend(
            actor,
            resource,
            before[resource] - actor[resource]
        )
        return receipt !== undefined ? [receipt] : []
    })
}

export function practiceResourceMissing(
    actor: GameCharacter,
    resource: PracticeResource,
    missingBefore = missingResource(actor, resource)
): number {
    return reconcile(actor, resource, Math.max(0, missingBefore)).reduce(
        (sum, loss) => sum + (loss.useful ? loss.remaining : 0),
        0
    )
}

/** Consume before adding the actual recovery; natural recovery uses this too. */
export function consumeResourceRecovery(
    actor: GameCharacter,
    resource: PracticeResource,
    amount: number,
    missingBefore: number
): number {
    return consumeRecovery(actor, resource, amount, missingBefore).useful
}

export function restoreEnergy(
    actor: GameCharacter,
    amount: number,
    now: number,
    factors?: Record<ConstellationId, number>
) {
    const missing = missingResource(actor, 'energy')
    const restored = Math.min(Math.max(0, amount), missing)
    const { useful, work, combat } = consumeRecovery(
        actor,
        'energy',
        restored,
        missing
    )
    actor.energy += restored
    return {
        useful,
        restored,
        events: recordLifeEnergyRecovery(actor, work, combat, now, factors),
    }
}

function consumeRecovery(
    actor: GameCharacter,
    resource: PracticeResource,
    amount: number,
    missingBefore: number
) {
    const losses = reconcile(actor, resource, Math.max(0, missingBefore))
    let remaining = Math.min(Math.max(0, amount), Math.max(0, missingBefore))
    let useful = 0
    let work = 0
    let combat = 0
    for (const loss of losses) {
        const recovered = Math.min(loss.remaining, remaining)
        loss.remaining -= recovered
        remaining -= recovered
        if (loss.useful) {
            useful += recovered
        }
        if (loss.lifeSource === 'work') {
            work += recovered
        } else if (loss.lifeSource === 'combat') {
            combat += recovered
        } else if (
            loss.resource === 'energy' &&
            loss.paid > 0 &&
            !loss.useful
        ) {
            loss.recoveredBeforeConfirmation += recovered
        }
    }
    actor.resourcePractice[resource] = losses.filter(
        (loss) => loss.remaining > 0
    )
    return { useful, work, combat }
}

export function clearResourcePractice(actor: GameCharacter): void {
    for (const resource of ['mana', 'energy'] as const) {
        for (const loss of actor.resourcePractice[resource]) {
            loss.paid = 0
            loss.remaining = 0
        }
        actor.resourcePractice[resource] = []
    }
    const training = actor.progression.constellations.lifeEnergy
    training.restUntil = 0
    training.recentSpends = []
}
