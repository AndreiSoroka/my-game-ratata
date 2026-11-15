import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'

export type PracticeResource = 'mana' | 'energy'

/** A paid loss remains recoverable only until some real recovery consumes it. */
export interface ResourceSpendReceipt {
    remaining: number
    useful: boolean
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
            ? actor.config.resources.maxMana
            : actor.config.resources.maxEnergy
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
            remaining: missing - tracked,
            useful: false,
        })
    }
    return actor.resourcePractice[resource]
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
    const paid = Math.min(amount, missing)
    const losses = reconcile(actor, resource, Math.max(0, missing - paid))
    const receipt = { remaining: paid, useful: false }
    if (paid > 0) {
        losses.push(receipt)
    }
    return paid > 0 ? receipt : undefined
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
        receipts.forEach(confirmResourceSpend)
    }
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
    const losses = reconcile(actor, resource, Math.max(0, missingBefore))
    let remaining = Math.min(Math.max(0, amount), Math.max(0, missingBefore))
    let useful = 0
    for (const loss of losses) {
        const recovered = Math.min(loss.remaining, remaining)
        loss.remaining -= recovered
        remaining -= recovered
        if (loss.useful) {
            useful += recovered
        }
    }
    actor.resourcePractice[resource] = losses.filter(
        (loss) => loss.remaining > 0
    )
    return useful
}

export function clearResourcePractice(actor: GameCharacter): void {
    for (const resource of ['mana', 'energy'] as const) {
        for (const loss of actor.resourcePractice[resource]) {
            loss.remaining = 0
        }
        actor.resourcePractice[resource] = []
    }
}
