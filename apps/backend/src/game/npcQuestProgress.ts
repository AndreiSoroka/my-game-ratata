import type {
    GameEventPayload,
    QuestObjective,
} from '@my-game-ratata/contracts'

import { creditOwnerId, nearKill, questDeath } from './guildRules'
import { itemQuantity } from './inventory'
import {
    movementFingerprint,
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    questActorAvailable,
} from './npcQuestTypes'
import { availableInventoryQuantity } from './rewardReservations'

export function objectiveGoal(objective: QuestObjective): number {
    return objective.kind === 'defeat' || objective.kind === 'deliver'
        ? objective.quantity
        : 1
}

export function refreshQuestProgress(
    job: NpcQuestRecord,
    environment: NpcQuestEnvironment
): void {
    if (job.view.status !== 'active' && job.view.status !== 'ready') {
        return
    }
    const group = environment.parties.contractRoster(job.view.instanceId)
    for (const [index, objective] of job.draft.objectives.entries()) {
        if (objective.kind === 'deliver') {
            const quantities = [...group.members].map((id) => {
                const actor = environment.getCharacter(id)
                return (
                    actor?.inventory.reduce(
                        (sum, item) =>
                            sum +
                            (item.itemId === objective.itemId
                                ? Math.min(
                                      itemQuantity(item),
                                      availableInventoryQuantity(
                                          actor.inventory,
                                          item.instanceId
                                      )
                                  )
                                : 0),
                        0
                    ) ?? 0
                )
            })
            job.view.progress[index] = Math.min(
                objective.quantity,
                Math.max(0, ...quantities)
            )
        }
        if (objective.kind === 'visit') {
            refreshVisit(job, index, objective, group.members, environment)
        }
    }
    job.view.status = job.draft.objectives.every(
        (entry, index) =>
            (job.view.progress[index] ?? 0) >= objectiveGoal(entry)
    )
        ? 'ready'
        : 'active'
}

function refreshVisit(
    job: NpcQuestRecord,
    index: number,
    objective: Extract<QuestObjective, { kind: 'visit' }>,
    members: Set<string>,
    environment: NpcQuestEnvironment
): void {
    for (const id of members) {
        const actor = environment.getCharacter(id)
        if (
            !questActorAvailable(actor) ||
            actor.locationId !== objective.locationId ||
            job.baseline.get(id) === movementFingerprint(actor)
        ) {
            continue
        }
        if (
            objective.position === undefined ||
            Math.hypot(
                actor.position.x - objective.position.x,
                actor.position.y - objective.position.y
            ) <= 32
        ) {
            job.view.progress[index] = 1
        }
    }
}

export function observeQuestDeath(
    job: NpcQuestRecord,
    event: GameEventPayload,
    environment: NpcQuestEnvironment
): void {
    if (job.view.status !== 'active' || event.kind !== 'death') {
        return
    }
    const target = environment.getCharacter(event.targetId ?? '')
    const killer = environment.getCharacter(event.actorId ?? '')
    if (target === undefined || killer === undefined || !questDeath(target)) {
        return
    }
    const receipt = `death:${target.id}:${String(target.deathSequence)}`
    const ownerId = creditOwnerId(killer)
    const group = environment.parties.contractRoster(job.view.instanceId)
    if (
        ownerId === undefined ||
        !group.members.has(ownerId) ||
        !nearKill(environment.getCharacter(ownerId), target) ||
        job.receipts.has(receipt)
    ) {
        return
    }
    job.receipts.add(receipt)
    creditObjectives(job, target)
}

function creditObjectives(
    job: NpcQuestRecord,
    target: import('./character').GameCharacter
): void {
    for (const [index, objective] of job.draft.objectives.entries()) {
        if (
            objective.kind === 'defeat' &&
            objective.archetype === target.archetype &&
            objective.locationId === target.locationId
        ) {
            job.view.progress[index] = Math.min(
                objective.quantity,
                (job.view.progress[index] ?? 0) + 1
            )
        }
    }
}

export function inspectQuest(
    job: NpcQuestRecord,
    actorId: string,
    targetId: string,
    receiptId: string,
    environment: NpcQuestEnvironment
): void {
    if (
        job.view.status !== 'active' ||
        !environment.parties
            .contractRoster(job.view.instanceId)
            .members.has(actorId) ||
        job.receipts.has(receiptId)
    ) {
        return
    }
    job.receipts.add(receiptId)
    for (const [index, objective] of job.draft.objectives.entries()) {
        if (objective.kind === 'inspect' && objective.targetId === targetId) {
            job.view.progress[index] = 1
        }
    }
}
